import { MAX_FAILED_ATTEMPTS, MAX_TTL_SECONDS, MAX_VIEWS, MIN_TTL_SECONDS } from '$lib/config';

const b64 = (description: string, example?: string) => ({
	type: 'string',
	pattern: '^[A-Za-z0-9_-]+$',
	description,
	...(example ? { example } : {})
});

const error = {
	type: 'object',
	required: ['error'],
	properties: {
		error: {
			type: 'object',
			required: ['code', 'message'],
			properties: {
				code: {
					type: 'string',
					enum: [
						'invalid_request',
						'invalid_json',
						'unsupported_media_type',
						'payload_too_large',
						'secret_too_large',
						'invalid_api_key',
						'not_found',
						'password_required',
						'invalid_credentials',
						'destroyed',
						'missing_delete_token',
						'invalid_delete_token',
						'rate_limited',
						'internal_error'
					]
				},
				message: { type: 'string' },
				attemptsRemaining: { type: 'integer' },
				retryAfter: { type: 'integer', description: 'Seconds until the rate limit resets' },
				field: { type: 'string' }
			}
		}
	}
};

const errorResponse = (description: string) => ({
	description,
	content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
});

export function openapi(origin: string) {
	return {
		openapi: '3.1.0',
		info: {
			title: 'giar otp API',
			version: '1.0.0',
			description:
				'Self-destructing, end-to-end encrypted secrets. Secrets are encrypted with AES-256-GCM before they are stored; ' +
				'the key is only part of the share link (URL fragment) and never stored on the server. ' +
				'Use the SDKs for end-to-end mode, or send plain text for quick shell usage.'
		},
		servers: [{ url: origin }],
		components: {
			securitySchemes: {
				apiKey: {
					type: 'http',
					scheme: 'bearer',
					description: 'Optional. `Authorization: Bearer ogk_...` raises the rate limit for creating secrets.'
				}
			},
			schemas: {
				Error: error,
				Kdf: {
					oneOf: [
						{ type: 'null' },
						{
							type: 'object',
							required: ['name', 'iterations'],
							properties: {
								name: { const: 'pbkdf2-sha256' },
								iterations: { type: 'integer', minimum: 100000, maximum: 10000000, example: 600000 }
							}
						}
					]
				},
				CreateEncrypted: {
					title: 'End-to-end encrypted (SDKs, web app)',
					type: 'object',
					required: ['version', 'ciphertext', 'iv', 'salt', 'authToken'],
					properties: {
						version: { const: 1 },
						ciphertext: b64('AES-256-GCM ciphertext incl. 16-byte tag'),
						iv: b64('12 bytes'),
						salt: b64('16 bytes'),
						kdf: { $ref: '#/components/schemas/Kdf' },
						authToken: b64('32 bytes, HKDF-SHA256(ikm, salt, "otp-giar:v1:auth")'),
						expiresIn: { type: 'integer', minimum: MIN_TTL_SECONDS, maximum: MAX_TTL_SECONDS, default: 86400 },
						maxViews: { type: 'integer', minimum: 1, maximum: MAX_VIEWS, default: 1 }
					}
				},
				CreatePlain: {
					title: 'Plain text (server encrypts, key is returned once)',
					type: 'object',
					required: ['secret'],
					properties: {
						secret: { type: 'string', maxLength: 65536, example: 'DB_PASSWORD=hunter2' },
						password: { type: 'string', maxLength: 1024 },
						expiresIn: { type: 'integer', minimum: MIN_TTL_SECONDS, maximum: MAX_TTL_SECONDS, default: 86400 },
						maxViews: { type: 'integer', minimum: 1, maximum: MAX_VIEWS, default: 1 }
					}
				},
				Created: {
					type: 'object',
					required: ['id', 'url', 'expiresAt', 'maxViews', 'deleteToken'],
					properties: {
						id: b64('192-bit random ID (32 chars)'),
						url: { type: 'string', format: 'uri', description: 'Share URL without key. Append `#<key>`.' },
						expiresAt: { type: 'string', format: 'date-time' },
						maxViews: { type: 'integer' },
						deleteToken: b64('Send as X-Delete-Token to burn the secret early'),
						key: b64('Plain text mode only: the link key'),
						link: { type: 'string', format: 'uri', description: 'Plain text mode only: complete share link' }
					}
				},
				Info: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						createdAt: { type: 'string', format: 'date-time' },
						expiresAt: { type: 'string', format: 'date-time' },
						maxViews: { type: 'integer' },
						viewsRemaining: { type: 'integer' },
						passwordRequired: { type: 'boolean' },
						salt: b64('16 bytes'),
						kdf: { $ref: '#/components/schemas/Kdf' }
					}
				}
			}
		},
		paths: {
			'/api/v1/secrets': {
				post: {
					summary: 'Create a secret',
					security: [{}, { apiKey: [] }],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									oneOf: [
										{ $ref: '#/components/schemas/CreateEncrypted' },
										{ $ref: '#/components/schemas/CreatePlain' }
									]
								}
							}
						}
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: { $ref: '#/components/schemas/Created' } } }
						},
						'400': errorResponse('Invalid request'),
						'401': errorResponse('Invalid API key'),
						'413': errorResponse('Secret larger than 64 KiB'),
						'429': errorResponse('Rate limited')
					}
				}
			},
			'/api/v1/secrets/{id}': {
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				get: {
					summary: 'Read metadata (does not consume a view)',
					responses: {
						'200': {
							description: 'Secret exists',
							content: { 'application/json': { schema: { $ref: '#/components/schemas/Info' } } }
						},
						'404': errorResponse('Does not exist, expired or already opened')
					}
				},
				delete: {
					summary: 'Burn a secret before it is read',
					parameters: [{ name: 'X-Delete-Token', in: 'header', required: true, schema: { type: 'string' } }],
					responses: {
						'204': { description: 'Deleted' },
						'403': errorResponse('Wrong delete token'),
						'404': errorResponse('Does not exist')
					}
				}
			},
			'/api/v1/secrets/{id}/reveal': {
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				post: {
					summary: 'Open a secret (consumes one view)',
					description: `After ${MAX_FAILED_ATTEMPTS} wrong attempts the secret is destroyed.`,
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									oneOf: [
										{
											title: 'End-to-end',
											type: 'object',
											required: ['authToken'],
											properties: { authToken: b64('32 bytes') }
										},
										{
											title: 'Server-side decryption',
											type: 'object',
											required: ['key'],
											properties: { key: b64('Link key (after #)'), password: { type: 'string' } }
										}
									]
								}
							}
						}
					},
					responses: {
						'200': {
							description:
								'End-to-end: `ciphertext`, `iv`, `salt`, `kdf`. Server-side: `secret`. Both: `viewsRemaining`, `expiresAt`.',
							content: { 'application/json': { schema: { type: 'object' } } }
						},
						'400': errorResponse('Password required / invalid request'),
						'401': errorResponse('Wrong password or key (attemptsRemaining)'),
						'404': errorResponse('Does not exist, expired or already opened'),
						'410': errorResponse('Destroyed after too many failed attempts'),
						'429': errorResponse('Rate limited')
					}
				}
			}
		}
	};
}
