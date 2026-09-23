// The protocol lives in the JS SDK so the web app and the SDK can never drift apart.
export * from '../../sdks/js/src/crypto';
export { OtpClient, OtpError } from '../../sdks/js/src/client';
export type { CreatedSecret, SecretInfo } from '../../sdks/js/src/client';
