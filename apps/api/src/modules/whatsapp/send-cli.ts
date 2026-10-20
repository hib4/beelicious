import { parseEnvironment } from '../../config.js';
import { createWhatsAppClient, WhatsAppSendError } from './client.js';
import { GREETING } from './worker.js';

async function main() {
  const config = parseEnvironment(process.env);
  const whatsapp = config.whatsapp;
  const recipient = whatsapp?.testRecipients[0];
  if (
    config.NODE_ENV !== 'development' ||
    !whatsapp?.testBotEnabled ||
    !recipient
  ) {
    throw new Error(
      'Development test bot and an approved recipient are required',
    );
  }
  await createWhatsAppClient(whatsapp).sendTextMessage(recipient, GREETING);
  console.log(
    'Text accepted by Meta. Confirm delivery on the approved test phone.',
  );
}
main().catch((error: unknown) => {
  if (error instanceof WhatsAppSendError) {
    console.error(
      `Send failed: ${error.category}; HTTP ${error.httpStatus ?? 0}; Meta code ${error.metaCode ?? 0}. Uncertain sends must not be blindly repeated.`,
    );
  } else {
    console.error('Unable to send: check development WhatsApp configuration.');
  }
  process.exitCode = 1;
});
