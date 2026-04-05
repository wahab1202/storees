/**
 * Register all channel providers with the registry.
 * Called once on app startup from index.ts.
 */
import { registerChannelProvider } from '../channelProviderRegistry.js'
import { twilioSmsProvider, twilioWhatsappProvider } from './twilioProvider.js'
import { gupshupSmsProvider, gupshupWhatsappProvider } from './gupshupProvider.js'
import { birdSmsProvider, birdWhatsappProvider } from './birdProvider.js'
import { vonageSmsProvider, vonageWhatsappProvider } from './vonageProvider.js'
import { metaWhatsappProvider } from './metaWhatsappProvider.js'
import { fcmProvider } from './fcmProvider.js'

export function registerAllProviders(): void {
  // SMS providers
  registerChannelProvider('sms_twilio', twilioSmsProvider)
  registerChannelProvider('sms_gupshup', gupshupSmsProvider)
  registerChannelProvider('sms_bird', birdSmsProvider)
  registerChannelProvider('sms_vonage', vonageSmsProvider)

  // WhatsApp providers
  registerChannelProvider('whatsapp_twilio', twilioWhatsappProvider)
  registerChannelProvider('whatsapp_gupshup', gupshupWhatsappProvider)
  registerChannelProvider('whatsapp_bird', birdWhatsappProvider)
  registerChannelProvider('whatsapp_vonage', vonageWhatsappProvider)
  registerChannelProvider('whatsapp_meta', metaWhatsappProvider)

  // Push providers
  registerChannelProvider('push_fcm', fcmProvider)

  console.log('[channels] All providers registered (4 SMS, 5 WhatsApp, 1 Push)')
}
