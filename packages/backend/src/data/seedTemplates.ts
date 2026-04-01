/* ─── Seed Templates ─── */
/* Production-grade templates across Email, SMS, Push & WhatsApp */

type SeedTemplate = {
  name: string
  channel: 'email' | 'sms' | 'push' | 'whatsapp'
  subject?: string
  htmlBody?: string
  bodyText?: string
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL TEMPLATES — Rich HTML with modern design
   ═══════════════════════════════════════════════════════════════ */

const emailBase = (content: string) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  * { box-sizing:border-box; }
  body,html { margin:0; padding:0; width:100%; background:#f0f0f5; -webkit-text-size-adjust:100%; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; }
  img { border:0; display:block; max-width:100%; }
  a { color:inherit; }
  .wrapper { max-width:640px; margin:0 auto; }
  @media only screen and (max-width:660px) {
    .wrapper { width:100%!important; }
    .mob-pad { padding-left:16px!important; padding-right:16px!important; }
    .mob-stack { display:block!important; width:100%!important; }
    .mob-center { text-align:center!important; }
    .mob-hide { display:none!important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f0f0f5;">
<center>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f5;">
<tr><td style="padding:24px 16px;">
  <table role="presentation" class="wrapper" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    ${content}
  </table>
  <!-- Footer -->
  <table role="presentation" class="wrapper" width="640" cellpadding="0" cellspacing="0">
    <tr><td style="padding:24px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">Sent by <strong>{{store_name}}</strong> powered by Storees</p>
      <p style="margin:0;font-size:11px;color:#b0b0b8;">
        <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        &nbsp;&middot;&nbsp;
        <a href="{{preferences_url}}" style="color:#6b7280;text-decoration:underline;">Preferences</a>
        &nbsp;&middot;&nbsp;
        <a href="{{store_url}}" style="color:#6b7280;text-decoration:underline;">Visit Store</a>
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</center>
</body>
</html>`

export const SEED_TEMPLATES: SeedTemplate[] = [

  // ═══════════════════════════════════════════════
  // 1. WELCOME EMAIL — Bold hero with gradient
  // ═══════════════════════════════════════════════
  {
    name: 'Welcome — Hero Gradient',
    channel: 'email',
    subject: 'Welcome to {{store_name}}! Your journey starts here ✨',
    htmlBody: emailBase(`
    <!-- Hero -->
    <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:60px 48px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Welcome to</p>
      <h1 style="margin:0 0 16px;font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">{{store_name}}</h1>
      <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:rgba(255,255,255,0.9);max-width:420px;display:inline-block;">We're excited to have you! Explore our curated collection and find something you'll love.</p>
      <a href="{{store_url}}" style="display:inline-block;padding:14px 36px;background:#ffffff;color:#764ba2;font-size:14px;font-weight:700;border-radius:50px;text-decoration:none;letter-spacing:0.3px;">Start Shopping →</a>
    </td></tr>
    <!-- Welcome offer -->
    <tr><td style="padding:40px 48px;" class="mob-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-radius:12px;">
        <tr><td style="padding:28px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#92400e;font-weight:600;">Your Welcome Gift</p>
          <p style="margin:0 0 8px;font-size:42px;font-weight:900;color:#78350f;letter-spacing:-1px;">10% OFF</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border-radius:8px;border:2px dashed #d97706;">
            <tr><td style="padding:8px 20px;">
              <p style="margin:0;font-size:18px;font-weight:800;color:#d97706;letter-spacing:3px;">WELCOME10</p>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;color:#92400e;">Valid for 7 days · Min. order $25</p>
        </td></tr>
      </table>
    </td></tr>
    <!-- Features -->
    <tr><td style="padding:0 48px 40px;" class="mob-pad">
      <h2 style="margin:0 0 20px;font-size:18px;font-weight:700;color:#1f2937;">Why you'll love us</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;border-radius:10px;vertical-align:top;" width="33%" class="mob-stack">
            <p style="margin:0 0 6px;font-size:24px;">🚚</p>
            <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#1f2937;">Free Shipping</p>
            <p style="margin:0;font-size:11px;color:#6b7280;">On orders over $50</p>
          </td>
          <td width="8" class="mob-hide"></td>
          <td style="padding:12px 16px;background:#f9fafb;border-radius:10px;vertical-align:top;" width="33%" class="mob-stack">
            <p style="margin:0 0 6px;font-size:24px;">↩️</p>
            <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#1f2937;">Easy Returns</p>
            <p style="margin:0;font-size:11px;color:#6b7280;">30-day return policy</p>
          </td>
          <td width="8" class="mob-hide"></td>
          <td style="padding:12px 16px;background:#f9fafb;border-radius:10px;vertical-align:top;" width="33%" class="mob-stack">
            <p style="margin:0 0 6px;font-size:24px;">💬</p>
            <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#1f2937;">24/7 Support</p>
            <p style="margin:0;font-size:11px;color:#6b7280;">We're always here</p>
          </td>
        </tr>
      </table>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 2. ABANDONED CART — Product-focused with urgency
  // ═══════════════════════════════════════════════
  {
    name: 'Abandoned Cart — Urgency',
    channel: 'email',
    subject: '{{customer_name}}, your cart is waiting 🛒',
    htmlBody: emailBase(`
    <!-- Top bar -->
    <tr><td style="background:#1f2937;padding:12px 48px;text-align:center;" class="mob-pad">
      <p style="margin:0;font-size:12px;color:#fbbf24;font-weight:600;letter-spacing:1px;">⏰ YOUR ITEMS ARE SELLING FAST — COMPLETE YOUR ORDER</p>
    </td></tr>
    <!-- Hero -->
    <tr><td style="padding:40px 48px 0;" class="mob-pad">
      <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#1f2937;">You left something behind</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">Hey {{customer_name}}, we noticed you didn't finish checking out. Your items are still in your cart — but we can't hold them forever.</p>
    </td></tr>
    <!-- Cart summary card -->
    <tr><td style="padding:0 48px 32px;" class="mob-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#f9fafb;padding:16px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Your Cart Summary</p>
        </td></tr>
        <tr><td style="padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <p style="margin:0;font-size:13px;color:#6b7280;">Items</p>
              </td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#1f2937;">{{cart_item_count}} items</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;">
                <p style="margin:0;font-size:14px;font-weight:600;color:#1f2937;">Total</p>
              </td>
              <td style="padding:12px 0;text-align:right;">
                <p style="margin:0;font-size:22px;font-weight:800;color:#667eea;">{{cart_total}}</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <!-- CTA -->
    <tr><td style="padding:0 48px 16px;text-align:center;" class="mob-pad">
      <a href="{{cart_url}}" style="display:inline-block;width:100%;max-width:360px;padding:16px 24px;background:linear-gradient(135deg,#667eea,#764ba2);color:#ffffff;font-size:16px;font-weight:700;border-radius:12px;text-decoration:none;text-align:center;">Complete My Order →</a>
    </td></tr>
    <tr><td style="padding:0 48px 40px;text-align:center;" class="mob-pad">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Free shipping on this order · Secure checkout</p>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 3. ORDER CONFIRMATION — Clean receipt style
  // ═══════════════════════════════════════════════
  {
    name: 'Order Confirmation — Receipt',
    channel: 'email',
    subject: 'Order #{{order_number}} confirmed ✅',
    htmlBody: emailBase(`
    <!-- Success header -->
    <tr><td style="background:linear-gradient(135deg,#059669,#10b981);padding:40px 48px;text-align:center;" class="mob-pad">
      <div style="width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 16px;line-height:64px;font-size:32px;">✓</div>
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#ffffff;">Order Confirmed!</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">Thank you for your purchase, {{customer_name}}</p>
    </td></tr>
    <!-- Order details -->
    <tr><td style="padding:32px 48px;" class="mob-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:20px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:6px 0;"><p style="margin:0;font-size:12px;color:#6b7280;">Order Number</p></td>
              <td style="padding:6px 0;text-align:right;"><p style="margin:0;font-size:14px;font-weight:700;color:#1f2937;">#{{order_number}}</p></td>
            </tr>
            <tr>
              <td style="padding:6px 0;"><p style="margin:0;font-size:12px;color:#6b7280;">Date</p></td>
              <td style="padding:6px 0;text-align:right;"><p style="margin:0;font-size:13px;color:#374151;">{{order_date}}</p></td>
            </tr>
            <tr>
              <td style="padding:6px 0;"><p style="margin:0;font-size:12px;color:#6b7280;">Payment</p></td>
              <td style="padding:6px 0;text-align:right;"><p style="margin:0;font-size:13px;color:#374151;">{{payment_method}}</p></td>
            </tr>
            <tr>
              <td colspan="2" style="padding:12px 0 0;border-top:2px solid #e5e7eb;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td><p style="margin:0;font-size:16px;font-weight:700;color:#1f2937;">Total</p></td>
                    <td style="text-align:right;"><p style="margin:0;font-size:22px;font-weight:800;color:#059669;">{{order_total}}</p></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <!-- Track order -->
    <tr><td style="padding:0 48px 40px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">We'll email you tracking info once your order ships.</p>
      <a href="{{order_status_url}}" style="display:inline-block;padding:14px 32px;background:#1f2937;color:#ffffff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;">Track My Order</a>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 4. FLASH SALE — Bold, urgency-driven
  // ═══════════════════════════════════════════════
  {
    name: 'Flash Sale — Bold',
    channel: 'email',
    subject: '⚡ FLASH SALE — Up to 50% off for 24 hours!',
    htmlBody: emailBase(`
    <!-- Hero -->
    <tr><td style="background:linear-gradient(135deg,#dc2626,#f97316);padding:56px 48px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.8);font-weight:600;">Limited Time Only</p>
      <h1 style="margin:0 0 4px;font-size:64px;font-weight:900;color:#ffffff;letter-spacing:-2px;line-height:1;">FLASH</h1>
      <h1 style="margin:0 0 16px;font-size:64px;font-weight:900;color:#fef3c7;letter-spacing:-2px;line-height:1;">SALE</h1>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;background:rgba(0,0,0,0.2);border-radius:50px;">
        <tr><td style="padding:8px 24px;">
          <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;">UP TO 50% OFF</p>
        </td></tr>
      </table>
      <a href="{{sale_url}}" style="display:inline-block;padding:16px 40px;background:#ffffff;color:#dc2626;font-size:16px;font-weight:800;border-radius:50px;text-decoration:none;letter-spacing:0.5px;">SHOP NOW →</a>
    </td></tr>
    <!-- Timer -->
    <tr><td style="padding:32px 48px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:2px;">Sale ends in</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 8px;text-align:center;">
            <div style="width:64px;height:64px;background:#1f2937;border-radius:12px;line-height:64px;font-size:28px;font-weight:900;color:#ffffff;">24</div>
            <p style="margin:6px 0 0;font-size:10px;color:#9ca3af;text-transform:uppercase;">Hours</p>
          </td>
          <td style="font-size:28px;font-weight:700;color:#d1d5db;">:</td>
          <td style="padding:0 8px;text-align:center;">
            <div style="width:64px;height:64px;background:#1f2937;border-radius:12px;line-height:64px;font-size:28px;font-weight:900;color:#ffffff;">00</div>
            <p style="margin:6px 0 0;font-size:10px;color:#9ca3af;text-transform:uppercase;">Mins</p>
          </td>
          <td style="font-size:28px;font-weight:700;color:#d1d5db;">:</td>
          <td style="padding:0 8px;text-align:center;">
            <div style="width:64px;height:64px;background:#1f2937;border-radius:12px;line-height:64px;font-size:28px;font-weight:900;color:#ffffff;">00</div>
            <p style="margin:6px 0 0;font-size:10px;color:#9ca3af;text-transform:uppercase;">Secs</p>
          </td>
        </tr>
      </table>
    </td></tr>
    <!-- Disclaimer -->
    <tr><td style="padding:0 48px 32px;text-align:center;" class="mob-pad">
      <p style="margin:0;font-size:12px;color:#9ca3af;">While stocks last. Cannot be combined with other offers.</p>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 5. WIN-BACK — Emotional re-engagement
  // ═══════════════════════════════════════════════
  {
    name: 'Win-Back — We Miss You',
    channel: 'email',
    subject: 'We miss you, {{customer_name}}! Come back for 15% off 💜',
    htmlBody: emailBase(`
    <!-- Hero -->
    <tr><td style="background:linear-gradient(180deg,#ede9fe 0%,#ffffff 100%);padding:48px 48px 0;text-align:center;" class="mob-pad">
      <p style="margin:0 0 12px;font-size:56px;">💜</p>
      <h1 style="margin:0 0 12px;font-size:30px;font-weight:800;color:#1f2937;">We miss you!</h1>
      <p style="margin:0 0 32px;font-size:15px;color:#6b7280;line-height:1.6;max-width:400px;display:inline-block;">It's been a while since your last visit, {{customer_name}}. A lot has changed — new arrivals, fresh collections, and exciting updates.</p>
    </td></tr>
    <!-- Offer -->
    <tr><td style="padding:0 48px 32px;" class="mob-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.7);font-weight:600;">Exclusive Comeback Offer</p>
          <p style="margin:0 0 4px;font-size:48px;font-weight:900;color:#ffffff;">15% OFF</p>
          <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.8);">Your entire next order</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background:rgba(255,255,255,0.15);border:1px dashed rgba(255,255,255,0.4);border-radius:8px;">
            <tr><td style="padding:10px 24px;">
              <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:4px;">COMEBACK15</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <!-- CTA -->
    <tr><td style="padding:0 48px 40px;text-align:center;" class="mob-pad">
      <a href="{{store_url}}" style="display:inline-block;padding:14px 36px;background:#1f2937;color:#ffffff;font-size:14px;font-weight:700;border-radius:50px;text-decoration:none;">See What's New →</a>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Valid for 5 days · Orders over $30</p>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 6. SHIPPING NOTIFICATION — Tracking focused
  // ═══════════════════════════════════════════════
  {
    name: 'Shipping — On Its Way',
    channel: 'email',
    subject: '📦 Your order is on its way!',
    htmlBody: emailBase(`
    <!-- Progress bar header -->
    <tr><td style="padding:40px 48px 0;" class="mob-pad">
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1f2937;">Your order has shipped! 📦</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Great news, {{customer_name}}! Your order is on its way.</p>
      <!-- Progress steps -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td width="25%" style="text-align:center;">
            <div style="width:32px;height:32px;background:#059669;border-radius:50%;margin:0 auto 6px;line-height:32px;color:#fff;font-size:14px;font-weight:700;">✓</div>
            <p style="margin:0;font-size:10px;color:#059669;font-weight:600;">Confirmed</p>
          </td>
          <td width="25%" style="text-align:center;">
            <div style="width:32px;height:32px;background:#059669;border-radius:50%;margin:0 auto 6px;line-height:32px;color:#fff;font-size:14px;font-weight:700;">✓</div>
            <p style="margin:0;font-size:10px;color:#059669;font-weight:600;">Packed</p>
          </td>
          <td width="25%" style="text-align:center;">
            <div style="width:32px;height:32px;background:#3b82f6;border-radius:50%;margin:0 auto 6px;line-height:32px;color:#fff;font-size:14px;font-weight:700;">●</div>
            <p style="margin:0;font-size:10px;color:#3b82f6;font-weight:700;">Shipped</p>
          </td>
          <td width="25%" style="text-align:center;">
            <div style="width:32px;height:32px;background:#e5e7eb;border-radius:50%;margin:0 auto 6px;line-height:32px;color:#9ca3af;font-size:14px;">○</div>
            <p style="margin:0;font-size:10px;color:#9ca3af;">Delivered</p>
          </td>
        </tr>
      </table>
    </td></tr>
    <!-- Tracking info -->
    <tr><td style="padding:0 48px 32px;" class="mob-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;">
        <tr><td style="padding:20px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;"><p style="margin:0;font-size:12px;color:#0369a1;">Carrier</p></td>
              <td style="text-align:right;"><p style="margin:0;font-size:13px;font-weight:700;color:#0c4a6e;">{{carrier_name}}</p></td>
            </tr>
            <tr>
              <td style="padding:4px 0;"><p style="margin:0;font-size:12px;color:#0369a1;">Tracking #</p></td>
              <td style="text-align:right;"><p style="margin:0;font-size:13px;font-weight:700;color:#0c4a6e;">{{tracking_number}}</p></td>
            </tr>
            <tr>
              <td style="padding:4px 0;"><p style="margin:0;font-size:12px;color:#0369a1;">Est. Delivery</p></td>
              <td style="text-align:right;"><p style="margin:0;font-size:13px;font-weight:700;color:#0c4a6e;">{{estimated_delivery}}</p></td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 48px 40px;text-align:center;" class="mob-pad">
      <a href="{{tracking_url}}" style="display:inline-block;padding:14px 32px;background:#0284c7;color:#ffffff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;">Track Package →</a>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 7. REVIEW REQUEST — Star rating visual
  // ═══════════════════════════════════════════════
  {
    name: 'Review Request — Stars',
    channel: 'email',
    subject: 'How was your order? ⭐ Leave a review',
    htmlBody: emailBase(`
    <tr><td style="padding:48px 48px 0;text-align:center;" class="mob-pad">
      <p style="margin:0 0 16px;font-size:40px;">⭐⭐⭐⭐⭐</p>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1f2937;">How did we do?</h1>
      <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;max-width:380px;display:inline-block;">Hey {{customer_name}}, your order <strong>#{{order_number}}</strong> was delivered. We'd love to hear what you think!</p>
    </td></tr>
    <tr><td style="padding:0 48px;text-align:center;" class="mob-pad">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 6px;"><a href="{{review_url}}?rating=1" style="display:block;width:48px;height:48px;background:#fef3c7;border-radius:12px;line-height:48px;text-align:center;font-size:20px;text-decoration:none;">1⭐</a></td>
          <td style="padding:0 6px;"><a href="{{review_url}}?rating=2" style="display:block;width:48px;height:48px;background:#fef3c7;border-radius:12px;line-height:48px;text-align:center;font-size:20px;text-decoration:none;">2⭐</a></td>
          <td style="padding:0 6px;"><a href="{{review_url}}?rating=3" style="display:block;width:48px;height:48px;background:#fef3c7;border-radius:12px;line-height:48px;text-align:center;font-size:20px;text-decoration:none;">3⭐</a></td>
          <td style="padding:0 6px;"><a href="{{review_url}}?rating=4" style="display:block;width:48px;height:48px;background:#fef3c7;border-radius:12px;line-height:48px;text-align:center;font-size:20px;text-decoration:none;">4⭐</a></td>
          <td style="padding:0 6px;"><a href="{{review_url}}?rating=5" style="display:block;width:48px;height:48px;background:#fef3c7;border-radius:12px;line-height:48px;text-align:center;font-size:20px;text-decoration:none;">5⭐</a></td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 48px 40px;text-align:center;" class="mob-pad">
      <a href="{{review_url}}" style="display:inline-block;padding:14px 32px;background:#f59e0b;color:#1f2937;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;">Write a Review</a>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Had an issue? <a href="{{support_url}}" style="color:#6366f1;">Contact support</a> — we'll make it right.</p>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 8. BIRTHDAY — Festive celebration
  // ═══════════════════════════════════════════════
  {
    name: 'Birthday — Celebration',
    channel: 'email',
    subject: '🎂 Happy Birthday, {{customer_name}}! A gift inside...',
    htmlBody: emailBase(`
    <tr><td style="background:linear-gradient(135deg,#ec4899,#f97316);padding:48px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 8px;font-size:56px;">🎂</p>
      <h1 style="margin:0 0 8px;font-size:32px;font-weight:900;color:#ffffff;">Happy Birthday!</h1>
      <p style="margin:0 0 24px;font-size:16px;color:rgba(255,255,255,0.9);">{{customer_name}}, today is your day!</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background:rgba(255,255,255,0.2);border-radius:16px;backdrop-filter:blur(10px);">
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.7);">Your Birthday Gift</p>
          <p style="margin:0 0 8px;font-size:48px;font-weight:900;color:#ffffff;">20% OFF</p>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">Code: <strong style="letter-spacing:3px;">BDAY20</strong></p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:32px 48px;text-align:center;" class="mob-pad">
      <a href="{{store_url}}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#ec4899,#f97316);color:#ffffff;font-size:15px;font-weight:700;border-radius:50px;text-decoration:none;">Treat Yourself →</a>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Valid for 7 days from your birthday</p>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 9. NEW ARRIVALS — Product showcase grid
  // ═══════════════════════════════════════════════
  {
    name: 'New Arrivals — Showcase',
    channel: 'email',
    subject: 'Just in: New arrivals you\'ll love ✨',
    htmlBody: emailBase(`
    <tr><td style="padding:48px 48px 24px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#6366f1;font-weight:700;">Just Dropped</p>
      <h1 style="margin:0 0 8px;font-size:30px;font-weight:800;color:#1f2937;">New Arrivals</h1>
      <p style="margin:0;font-size:14px;color:#6b7280;">Fresh finds curated just for you, {{customer_name}}</p>
    </td></tr>
    <!-- Product grid (2x2 placeholder) -->
    <tr><td style="padding:0 48px;" class="mob-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="48%" style="vertical-align:top;" class="mob-stack">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:12px;">
              <tr><td style="background:linear-gradient(135deg,#dbeafe,#ede9fe);height:160px;text-align:center;vertical-align:middle;">
                <p style="margin:0;font-size:48px;">👗</p>
              </td></tr>
              <tr><td style="padding:12px 16px;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1f2937;">{{product_1_name}}</p>
                <p style="margin:0;font-size:14px;font-weight:800;color:#6366f1;">{{product_1_price}}</p>
              </td></tr>
            </table>
          </td>
          <td width="4%" class="mob-hide"></td>
          <td width="48%" style="vertical-align:top;" class="mob-stack">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:12px;">
              <tr><td style="background:linear-gradient(135deg,#fce7f3,#fef3c7);height:160px;text-align:center;vertical-align:middle;">
                <p style="margin:0;font-size:48px;">👟</p>
              </td></tr>
              <tr><td style="padding:12px 16px;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1f2937;">{{product_2_name}}</p>
                <p style="margin:0;font-size:14px;font-weight:800;color:#6366f1;">{{product_2_price}}</p>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 48px 40px;text-align:center;" class="mob-pad">
      <a href="{{collection_url}}" style="display:inline-block;padding:14px 36px;background:#1f2937;color:#ffffff;font-size:14px;font-weight:700;border-radius:50px;text-decoration:none;">Shop All New Arrivals →</a>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 10. BACK IN STOCK — Urgency alert
  // ═══════════════════════════════════════════════
  {
    name: 'Back in Stock — Alert',
    channel: 'email',
    subject: '🔔 {{product_name}} is back in stock!',
    htmlBody: emailBase(`
    <tr><td style="background:#1f2937;padding:12px 48px;text-align:center;" class="mob-pad">
      <p style="margin:0;font-size:12px;color:#34d399;font-weight:700;letter-spacing:1px;">🔔 BACK IN STOCK — LIMITED AVAILABILITY</p>
    </td></tr>
    <tr><td style="padding:40px 48px;text-align:center;" class="mob-pad">
      <div style="width:120px;height:120px;background:linear-gradient(135deg,#dbeafe,#ede9fe);border-radius:20px;margin:0 auto 24px;line-height:120px;font-size:56px;">🎁</div>
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#1f2937;">{{product_name}}</h1>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">The item you wanted is finally back!</p>
      <p style="margin:0 0 24px;font-size:28px;font-weight:900;color:#6366f1;">{{product_price}}</p>
      <a href="{{product_url}}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#059669,#10b981);color:#ffffff;font-size:16px;font-weight:700;border-radius:50px;text-decoration:none;">Buy Now →</a>
      <p style="margin:16px 0 0;font-size:12px;color:#ef4444;font-weight:600;">⚡ Last time this sold out in 2 days</p>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 11. REFERRAL — Share & earn
  // ═══════════════════════════════════════════════
  {
    name: 'Referral — Share & Earn',
    channel: 'email',
    subject: 'Give $10, Get $10 — Share with friends 💌',
    htmlBody: emailBase(`
    <tr><td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:48px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 8px;font-size:48px;">🎁</p>
      <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;">Give $10, Get $10</h1>
      <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.85);">Share the love with friends & family</p>
    </td></tr>
    <tr><td style="padding:32px 48px;" class="mob-pad">
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Hey {{customer_name}}, for every friend you refer who makes a purchase, you both get <strong style="color:#1f2937;">$10 off</strong>. It's a win-win!</p>
      <!-- Referral link box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:2px dashed #d1d5db;border-radius:12px;">
        <tr><td style="padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:600;">Your Referral Link</p>
          <p style="margin:0;font-size:14px;font-weight:700;color:#6366f1;word-break:break-all;">{{referral_url}}</p>
        </td></tr>
      </table>
      <!-- How it works -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr>
          <td width="33%" style="text-align:center;padding:12px;" class="mob-stack">
            <div style="width:36px;height:36px;background:#ede9fe;border-radius:50%;margin:0 auto 8px;line-height:36px;font-size:14px;font-weight:800;color:#6366f1;">1</div>
            <p style="margin:0;font-size:12px;color:#374151;font-weight:600;">Share your link</p>
          </td>
          <td width="33%" style="text-align:center;padding:12px;" class="mob-stack">
            <div style="width:36px;height:36px;background:#ede9fe;border-radius:50%;margin:0 auto 8px;line-height:36px;font-size:14px;font-weight:800;color:#6366f1;">2</div>
            <p style="margin:0;font-size:12px;color:#374151;font-weight:600;">Friend gets $10 off</p>
          </td>
          <td width="33%" style="text-align:center;padding:12px;" class="mob-stack">
            <div style="width:36px;height:36px;background:#ede9fe;border-radius:50%;margin:0 auto 8px;line-height:36px;font-size:14px;font-weight:800;color:#6366f1;">3</div>
            <p style="margin:0;font-size:12px;color:#374151;font-weight:600;">You get $10 off</p>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 48px 40px;text-align:center;" class="mob-pad">
      <a href="{{referral_url}}" style="display:inline-block;padding:14px 36px;background:#6366f1;color:#ffffff;font-size:14px;font-weight:700;border-radius:50px;text-decoration:none;">Share Now →</a>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════
  // 12. LOYALTY POINTS — Rewards update
  // ═══════════════════════════════════════════════
  {
    name: 'Loyalty — Points Update',
    channel: 'email',
    subject: '🏆 You\'ve earned {{points_balance}} points!',
    htmlBody: emailBase(`
    <tr><td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:40px 48px;text-align:center;" class="mob-pad">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.7);font-weight:600;">Your Rewards</p>
      <p style="margin:0 0 4px;font-size:56px;font-weight:900;color:#ffffff;">{{points_balance}}</p>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">points · worth <strong>{{points_value}}</strong></p>
    </td></tr>
    <tr><td style="padding:32px 48px;" class="mob-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
        <tr><td style="padding:20px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:6px 0;border-bottom:1px solid #fef3c7;"><p style="margin:0;font-size:12px;color:#92400e;">Current Tier</p></td>
              <td style="padding:6px 0;border-bottom:1px solid #fef3c7;text-align:right;"><p style="margin:0;font-size:13px;font-weight:700;color:#78350f;">{{loyalty_tier}}</p></td>
            </tr>
            <tr>
              <td style="padding:6px 0;border-bottom:1px solid #fef3c7;"><p style="margin:0;font-size:12px;color:#92400e;">Points to Next Tier</p></td>
              <td style="padding:6px 0;border-bottom:1px solid #fef3c7;text-align:right;"><p style="margin:0;font-size:13px;font-weight:700;color:#78350f;">{{points_to_next_tier}}</p></td>
            </tr>
            <tr>
              <td style="padding:6px 0;"><p style="margin:0;font-size:12px;color:#92400e;">Lifetime Earned</p></td>
              <td style="padding:6px 0;text-align:right;"><p style="margin:0;font-size:13px;font-weight:700;color:#78350f;">{{lifetime_points}}</p></td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 48px 40px;text-align:center;" class="mob-pad">
      <a href="{{rewards_url}}" style="display:inline-block;padding:14px 32px;background:#d97706;color:#ffffff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;">Redeem Points →</a>
    </td></tr>`),
  },

  // ═══════════════════════════════════════════════════
  // SMS TEMPLATES (10)
  // ═══════════════════════════════════════════════════
  {
    name: 'SMS — Welcome',
    channel: 'sms',
    bodyText: 'Welcome to {{store_name}}, {{customer_name}}! 🎉 Use code WELCOME10 for 10% off your first order. Shop now: {{store_url}}',
  },
  {
    name: 'SMS — Abandoned Cart',
    channel: 'sms',
    bodyText: 'Hey {{customer_name}}, you left {{cart_item_count}} items in your cart ({{cart_total}}). Complete your order before they sell out! {{cart_url}}',
  },
  {
    name: 'SMS — Order Confirmed',
    channel: 'sms',
    bodyText: 'Order confirmed! ✅ Your order #{{order_number}} ({{order_total}}) is being prepared. Track it here: {{order_status_url}}',
  },
  {
    name: 'SMS — Shipped',
    channel: 'sms',
    bodyText: 'Your order #{{order_number}} has shipped! 📦 Track your package: {{tracking_url}} — Est. delivery: {{estimated_delivery}}',
  },
  {
    name: 'SMS — Flash Sale',
    channel: 'sms',
    bodyText: '⚡ FLASH SALE — Up to 50% off for 24 hours only! Don\'t miss out, {{customer_name}}. Shop now: {{sale_url}}',
  },
  {
    name: 'SMS — Win-Back',
    channel: 'sms',
    bodyText: 'We miss you, {{customer_name}}! 💜 Come back and enjoy 15% off with code COMEBACK15. Valid 5 days: {{store_url}}',
  },
  {
    name: 'SMS — Back in Stock',
    channel: 'sms',
    bodyText: '🔔 {{product_name}} is back in stock! Grab it before it\'s gone again: {{product_url}}',
  },
  {
    name: 'SMS — Birthday',
    channel: 'sms',
    bodyText: 'Happy Birthday, {{customer_name}}! 🎂 Here\'s 20% off as our gift. Use code BDAY20 at {{store_url}} — valid 7 days!',
  },
  {
    name: 'SMS — Review Request',
    channel: 'sms',
    bodyText: 'Hi {{customer_name}}, how was your recent order? We\'d love your feedback! Leave a quick review: {{review_url}} ⭐',
  },
  {
    name: 'SMS — Delivery Confirmed',
    channel: 'sms',
    bodyText: 'Your order #{{order_number}} has been delivered! 🎉 We hope you love it. Questions? Visit {{support_url}}',
  },

  // ═══════════════════════════════════════════════════
  // PUSH NOTIFICATION TEMPLATES (10)
  // Visual mockups of Android/iOS notifications
  // ═══════════════════════════════════════════════════
  ...pushTemplates(),

  // ═══════════════════════════════════════════════════
  // WHATSAPP TEMPLATES (8)
  // Chat bubble mockups with media previews
  // ═══════════════════════════════════════════════════
  ...whatsAppTemplates(),
]

/* ─── Push Notification Preview Builder ─── */

function pushPreview(opts: {
  title: string
  body: string
  image?: { gradient: string; emoji: string; label?: string }
  badge?: { text: string; color: string }
  buttons?: string[]
  time?: string
}): string {
  const { title, body, image, badge, buttons, time = '2m ago' } = opts
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.phone{width:340px;background:#0f0f23;border-radius:36px;padding:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
.screen{background:#1e1e3a;border-radius:28px;overflow:hidden;padding:20px 16px}
.status-bar{display:flex;justify-content:space-between;align-items:center;padding:0 4px 16px;font-size:11px;color:rgba(255,255,255,0.5);font-weight:600}
.notif{background:rgba(255,255,255,0.08);backdrop-filter:blur(20px);border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)}
.notif-header{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}
.app-icon{width:20px;height:20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700}
.app-name{font-size:11px;color:rgba(255,255,255,0.45);font-weight:500;flex:1}
.notif-time{font-size:10px;color:rgba(255,255,255,0.3)}
.notif-body{padding:0 14px 12px}
.notif-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:3px;line-height:1.3}
.notif-text{font-size:12px;color:rgba(255,255,255,0.6);line-height:1.4}
.notif-image{width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px}
.notif-image .emoji{font-size:40px}
.notif-image .label{font-size:14px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:1px}
.notif-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.5px}
.notif-actions{display:flex;border-top:1px solid rgba(255,255,255,0.06)}
.notif-actions button{flex:1;padding:10px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer}
.notif-actions button+button{border-left:1px solid rgba(255,255,255,0.06)}
</style></head><body>
<div class="phone"><div class="screen">
  <div class="status-bar"><span>9:41</span><span>●●●</span></div>
  <div class="notif">
    <div class="notif-header">
      <div class="app-icon">S</div>
      <span class="app-name">{{store_name}}</span>
      <span class="notif-time">${time}</span>
    </div>
    ${image ? `<div class="notif-image" style="background:${image.gradient}">
      <span class="emoji">${image.emoji}</span>
      ${image.label ? `<span class="label">${image.label}</span>` : ''}
    </div>` : ''}
    <div class="notif-body">
      ${badge ? `<span class="notif-badge" style="background:${badge.color};color:#fff;margin-bottom:6px;display:inline-block">${badge.text}</span><br/>` : ''}
      <p class="notif-title">${title}</p>
      <p class="notif-text">${body}</p>
    </div>
    ${buttons ? `<div class="notif-actions">${buttons.map(b => `<button>${b}</button>`).join('')}</div>` : ''}
  </div>
</div></div></body></html>`
}

function pushTemplates(): SeedTemplate[] {
  return [
    {
      name: 'Push — Welcome',
      channel: 'push',
      subject: 'Welcome aboard! 🎉',
      bodyText: 'Thanks for joining {{store_name}}! Use code WELCOME10 for 10% off your first order.',
      htmlBody: pushPreview({
        title: 'Welcome aboard! 🎉',
        body: 'Thanks for joining! Use code WELCOME10 for 10% off your first order.',
        image: { gradient: 'linear-gradient(135deg,#667eea,#764ba2)', emoji: '🎁', label: 'WELCOME10' },
        buttons: ['Shop Now', 'View Offer'],
      }),
    },
    {
      name: 'Push — Abandoned Cart',
      channel: 'push',
      subject: 'Forgot something? 🛒',
      bodyText: 'You left {{cart_item_count}} items in your cart worth {{cart_total}}. Complete your purchase now!',
      htmlBody: pushPreview({
        title: 'Forgot something? 🛒',
        body: 'You left items in your cart. Complete your purchase before they sell out!',
        image: { gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)', emoji: '🛒', label: 'ITEMS WAITING' },
        buttons: ['Complete Order', 'Dismiss'],
        badge: { text: 'CART REMINDER', color: '#ef4444' },
      }),
    },
    {
      name: 'Push — Flash Sale',
      channel: 'push',
      subject: '⚡ Flash Sale — 24 hrs only!',
      bodyText: 'Up to 50% off on your favorites. Shop before the deal disappears!',
      htmlBody: pushPreview({
        title: '⚡ Flash Sale — 24 hrs only!',
        body: 'Up to 50% off on your favorites. Shop before the deal disappears!',
        image: { gradient: 'linear-gradient(135deg,#dc2626,#f97316)', emoji: '⚡', label: 'UP TO 50% OFF' },
        buttons: ['Shop Sale', 'Remind Later'],
        badge: { text: 'LIMITED TIME', color: '#dc2626' },
      }),
    },
    {
      name: 'Push — Order Shipped',
      channel: 'push',
      subject: 'Your order is on its way! 📦',
      bodyText: 'Order #{{order_number}} has shipped. Tap to track your delivery.',
      htmlBody: pushPreview({
        title: 'Your order is on its way! 📦',
        body: 'Order has shipped. Tap to track your delivery in real-time.',
        image: { gradient: 'linear-gradient(135deg,#0ea5e9,#6366f1)', emoji: '📦', label: 'SHIPPED' },
        buttons: ['Track Package', 'Details'],
      }),
    },
    {
      name: 'Push — Delivered',
      channel: 'push',
      subject: 'Package delivered! 🎉',
      bodyText: 'Your order #{{order_number}} has arrived. Hope you love it!',
      htmlBody: pushPreview({
        title: 'Package delivered! 🎉',
        body: 'Your order has arrived. Hope you love it!',
        image: { gradient: 'linear-gradient(135deg,#059669,#10b981)', emoji: '✅', label: 'DELIVERED' },
        buttons: ['Rate Order', 'View Details'],
      }),
    },
    {
      name: 'Push — Back in Stock',
      channel: 'push',
      subject: 'It\'s back! 🔔',
      bodyText: '{{product_name}} is back in stock. Grab it before it sells out again!',
      htmlBody: pushPreview({
        title: 'It\'s back in stock! 🔔',
        body: 'The item you wanted is available again. Grab it before it sells out!',
        image: { gradient: 'linear-gradient(135deg,#10b981,#059669)', emoji: '🔔' },
        buttons: ['Buy Now', 'View Item'],
        badge: { text: 'BACK IN STOCK', color: '#059669' },
      }),
    },
    {
      name: 'Push — Price Drop',
      channel: 'push',
      subject: 'Price drop alert! 💰',
      bodyText: '{{product_name}} just dropped to {{product_price}}. Don\'t miss this deal!',
      htmlBody: pushPreview({
        title: 'Price drop alert! 💰',
        body: 'An item on your wishlist just got cheaper. Don\'t miss this deal!',
        image: { gradient: 'linear-gradient(135deg,#f59e0b,#eab308)', emoji: '💰', label: 'PRICE DROP' },
        buttons: ['View Deal', 'Dismiss'],
        badge: { text: 'PRICE ALERT', color: '#d97706' },
      }),
    },
    {
      name: 'Push — New Arrivals',
      channel: 'push',
      subject: 'New drops just landed ✨',
      bodyText: 'Fresh styles are here! Be the first to shop our latest collection.',
      htmlBody: pushPreview({
        title: 'New drops just landed ✨',
        body: 'Fresh styles are here! Be the first to shop our latest collection.',
        image: { gradient: 'linear-gradient(135deg,#ec4899,#8b5cf6)', emoji: '✨', label: 'NEW COLLECTION' },
        buttons: ['Explore', 'Later'],
      }),
    },
    {
      name: 'Push — Birthday',
      channel: 'push',
      subject: 'Happy Birthday! 🎂🎁',
      bodyText: 'We have a special gift for you — 20% off with code BDAY20. Valid for 7 days!',
      htmlBody: pushPreview({
        title: 'Happy Birthday! 🎂🎁',
        body: 'We have a special gift for you — 20% off! Use code BDAY20.',
        image: { gradient: 'linear-gradient(135deg,#ec4899,#f97316)', emoji: '🎂', label: '20% OFF' },
        buttons: ['Claim Gift', 'Remind Me'],
      }),
    },
    {
      name: 'Push — Loyalty Reward',
      channel: 'push',
      subject: 'You earned a reward! 🏆',
      bodyText: 'You\'ve hit {{points_balance}} points! Redeem now for exclusive perks.',
      htmlBody: pushPreview({
        title: 'You earned a reward! 🏆',
        body: 'You\'ve hit a new milestone! Redeem your points for exclusive perks.',
        image: { gradient: 'linear-gradient(135deg,#f59e0b,#d97706)', emoji: '🏆', label: 'REWARD UNLOCKED' },
        buttons: ['Redeem Now', 'View Points'],
        badge: { text: 'REWARDS', color: '#d97706' },
      }),
    },
  ]
}

/* ─── WhatsApp Chat Preview Builder ─── */

function waPreview(opts: {
  messages: Array<{
    type: 'text' | 'image' | 'document' | 'button-reply'
    content: string
    time?: string
    imageGradient?: string
    imageEmoji?: string
    imageCaption?: string
    buttons?: string[]
    docTitle?: string
    docSize?: string
  }>
}): string {
  const { messages } = opts
  const msgHtml = messages.map(m => {
    if (m.type === 'image') {
      return `<div class="msg sent">
        <div class="media" style="background:${m.imageGradient ?? 'linear-gradient(135deg,#dbeafe,#ede9fe)'}">
          <span class="media-emoji">${m.imageEmoji ?? '🖼️'}</span>
        </div>
        ${m.imageCaption ? `<p class="text">${m.imageCaption}</p>` : ''}
        ${m.buttons ? `<div class="wa-buttons">${m.buttons.map(b => `<div class="wa-btn">${b}</div>`).join('')}</div>` : ''}
        <span class="time">${m.time ?? '10:30 AM'} ✓✓</span>
      </div>`
    }
    if (m.type === 'document') {
      return `<div class="msg sent">
        <div class="doc">
          <div class="doc-icon">📄</div>
          <div class="doc-info">
            <p class="doc-name">${m.docTitle ?? 'Document'}</p>
            <p class="doc-size">${m.docSize ?? 'PDF · 1.2 MB'}</p>
          </div>
        </div>
        ${m.content ? `<p class="text">${m.content}</p>` : ''}
        <span class="time">${m.time ?? '10:30 AM'} ✓✓</span>
      </div>`
    }
    return `<div class="msg sent">
      <p class="text">${m.content}</p>
      ${m.buttons ? `<div class="wa-buttons">${m.buttons.map(b => `<div class="wa-btn">${b}</div>`).join('')}</div>` : ''}
      <span class="time">${m.time ?? '10:30 AM'} ✓✓</span>
    </div>`
  }).join('\n')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0b141a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.phone{width:340px;background:#0f0f23;border-radius:36px;padding:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
.screen{border-radius:28px;overflow:hidden;background:#0b141a}
.wa-header{background:#1f2c34;padding:12px 16px;display:flex;align-items:center;gap:10px}
.wa-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:700}
.wa-name{font-size:14px;font-weight:600;color:#e9edef}
.wa-status{font-size:10px;color:rgba(233,237,239,0.45)}
.wa-chat{background:#0b141a;background-image:url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L35 15 L30 10 L25 15Z' fill='rgba(255,255,255,0.01)'/%3E%3C/svg%3E");padding:16px 12px;min-height:320px;display:flex;flex-direction:column;justify-content:flex-end;gap:6px}
.msg{max-width:85%;padding:8px 10px 4px;border-radius:8px;position:relative}
.msg.sent{align-self:flex-end;background:#005c4b;border-top-right-radius:2px}
.msg .text{font-size:13px;color:#e9edef;line-height:1.5;white-space:pre-line}
.msg .text b{font-weight:700}
.msg .text i{font-style:italic;color:rgba(233,237,239,0.7)}
.msg .time{display:block;text-align:right;font-size:10px;color:rgba(233,237,239,0.4);margin-top:2px}
.media{width:100%;aspect-ratio:16/10;border-radius:6px;margin-bottom:6px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;overflow:hidden}
.media-emoji{font-size:36px}
.doc{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.15);border-radius:6px;padding:10px;margin-bottom:6px}
.doc-icon{font-size:28px}
.doc-name{font-size:12px;font-weight:600;color:#e9edef}
.doc-size{font-size:10px;color:rgba(233,237,239,0.5)}
.wa-buttons{display:flex;flex-direction:column;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08)}
.wa-btn{text-align:center;padding:8px;font-size:12px;font-weight:600;color:#53bdeb;cursor:pointer}
.wa-input{background:#1f2c34;padding:8px 12px;display:flex;align-items:center;gap:8px}
.wa-input-box{flex:1;background:#2a3942;border-radius:20px;padding:8px 14px;font-size:12px;color:rgba(233,237,239,0.4)}
.wa-send{width:36px;height:36px;background:#00a884;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px}
</style></head><body>
<div class="phone"><div class="screen">
  <div class="wa-header">
    <div class="wa-avatar">S</div>
    <div>
      <div class="wa-name">{{store_name}}</div>
      <div class="wa-status">Business Account</div>
    </div>
  </div>
  <div class="wa-chat">
    ${msgHtml}
  </div>
  <div class="wa-input">
    <div class="wa-input-box">Type a message</div>
    <div class="wa-send">▶</div>
  </div>
</div></div></body></html>`
}

function whatsAppTemplates(): SeedTemplate[] {
  return [
    {
      name: 'WhatsApp — Welcome',
      channel: 'whatsapp',
      subject: 'Welcome to {{store_name}}!',
      bodyText: 'Hey {{customer_name}}! 👋\n\nWelcome to *{{store_name}}*. We\'re so happy you\'re here!\n\nHere\'s *10% off* your first order:\n🏷️ Code: *WELCOME10*\n\n🛍️ Start shopping: {{store_url}}\n\n_Valid for 7 days. Min. order $25._',
      htmlBody: waPreview({ messages: [
        {
          type: 'image',
          content: '',
          imageGradient: 'linear-gradient(135deg,#667eea,#764ba2)',
          imageEmoji: '🎁',
          imageCaption: 'Hey there! 👋\n\nWelcome to <b>Your Store</b>. We\'re so happy you\'re here!\n\nHere\'s <b>10% off</b> your first order:\n🏷️ Code: <b>WELCOME10</b>',
          buttons: ['🛍️ Shop Now', '📋 View Catalog'],
          time: '10:30 AM',
        },
      ]}),
    },
    {
      name: 'WhatsApp — Abandoned Cart',
      channel: 'whatsapp',
      subject: 'You left items in your cart!',
      bodyText: 'Hey {{customer_name}}! 🛒\n\nYou have *{{cart_item_count}} items* worth *{{cart_total}}* in your cart.\n\nDon\'t let them slip away! Complete your order here:\n👉 {{cart_url}}\n\n_Need help? Just reply to this message!_',
      htmlBody: waPreview({ messages: [
        {
          type: 'image',
          content: '',
          imageGradient: 'linear-gradient(135deg,#f59e0b,#ef4444)',
          imageEmoji: '🛒',
          imageCaption: 'Hey! 🛒\n\nYou have <b>3 items</b> worth <b>$89.99</b> in your cart.\n\nDon\'t let them slip away!\n\n<i>Need help? Just reply to this message!</i>',
          buttons: ['✅ Complete Order', '🗑️ Clear Cart'],
          time: '2:15 PM',
        },
      ]}),
    },
    {
      name: 'WhatsApp — Order Confirmation',
      channel: 'whatsapp',
      subject: 'Order confirmed ✅',
      bodyText: 'Hi {{customer_name}}! ✅\n\nYour order has been confirmed!\n\n📦 *Order:* #{{order_number}}\n💰 *Total:* {{order_total}}\n📅 *Date:* {{order_date}}\n\nWe\'ll notify you once it ships.\n\n🔗 Track your order: {{order_status_url}}',
      htmlBody: waPreview({ messages: [
        {
          type: 'text',
          content: 'Hi there! ✅\n\nYour order has been confirmed!\n\n📦 <b>Order:</b> #STO-4821\n💰 <b>Total:</b> $129.00\n📅 <b>Date:</b> Mar 26, 2026\n\nWe\'ll notify you once it ships.',
          buttons: ['📦 Track Order', '📞 Contact Support'],
          time: '11:42 AM',
        },
      ]}),
    },
    {
      name: 'WhatsApp — Shipping Update',
      channel: 'whatsapp',
      subject: 'Your order has shipped 📦',
      bodyText: 'Great news, {{customer_name}}! 📦\n\nYour order *#{{order_number}}* is on its way!\n\n🚚 *Carrier:* {{carrier_name}}\n📍 *Tracking:* {{tracking_number}}\n📅 *Est. Delivery:* {{estimated_delivery}}\n\n🔗 Track here: {{tracking_url}}',
      htmlBody: waPreview({ messages: [
        {
          type: 'image',
          content: '',
          imageGradient: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
          imageEmoji: '📦',
          imageCaption: 'Great news! 📦\n\nYour order <b>#STO-4821</b> is on its way!\n\n🚚 <b>Carrier:</b> FedEx\n📍 <b>Tracking:</b> FX928374651\n📅 <b>Est. Delivery:</b> Mar 29',
          buttons: ['🔗 Track Package'],
          time: '3:05 PM',
        },
      ]}),
    },
    {
      name: 'WhatsApp — Flash Sale',
      channel: 'whatsapp',
      subject: '⚡ Flash Sale Alert!',
      bodyText: '⚡ *FLASH SALE* ⚡\n\nHey {{customer_name}}!\n\n🔥 Up to *50% OFF* for 24 hours only!\n⏰ Ends: {{sale_end_time}}\n\nDon\'t miss out — shop now:\n👉 {{sale_url}}\n\n_While stocks last._',
      htmlBody: waPreview({ messages: [
        {
          type: 'image',
          content: '',
          imageGradient: 'linear-gradient(135deg,#dc2626,#f97316)',
          imageEmoji: '⚡',
          imageCaption: '⚡ <b>FLASH SALE</b> ⚡\n\n🔥 Up to <b>50% OFF</b> for 24 hours only!\n⏰ Ends: Tomorrow at midnight\n\n<i>While stocks last.</i>',
          buttons: ['🛍️ Shop Sale', '⏰ Remind Me'],
          time: '9:00 AM',
        },
      ]}),
    },
    {
      name: 'WhatsApp — Birthday',
      channel: 'whatsapp',
      subject: 'Happy Birthday! 🎂',
      bodyText: '🎂 *Happy Birthday, {{customer_name}}!* 🎉\n\nWe have a special gift for you:\n\n🎁 *20% OFF* your next order\n🏷️ Use code: *BDAY20*\n\nTreat yourself today:\n👉 {{store_url}}\n\n_Valid for 7 days. Enjoy your special day!_ 💜',
      htmlBody: waPreview({ messages: [
        {
          type: 'image',
          content: '',
          imageGradient: 'linear-gradient(135deg,#ec4899,#f97316)',
          imageEmoji: '🎂',
          imageCaption: '🎂 <b>Happy Birthday!</b> 🎉\n\nWe have a special gift for you:\n\n🎁 <b>20% OFF</b> your next order\n🏷️ Code: <b>BDAY20</b>\n\n<i>Valid for 7 days. Enjoy your day! 💜</i>',
          buttons: ['🎁 Claim Gift', '🛍️ Shop Now'],
          time: '8:00 AM',
        },
      ]}),
    },
    {
      name: 'WhatsApp — Review Request',
      channel: 'whatsapp',
      subject: 'How was your order?',
      bodyText: 'Hi {{customer_name}}! ⭐\n\nYour order *#{{order_number}}* was delivered.\n\nHow was your experience? We\'d love your feedback!\n\n⭐ Leave a review: {{review_url}}\n\n_Your opinion helps us and other shoppers. Thanks!_',
      htmlBody: waPreview({ messages: [
        {
          type: 'text',
          content: 'Hi there! ⭐\n\nYour order <b>#STO-4821</b> was delivered.\n\nHow was your experience? We\'d love your feedback!\n\n<i>Your opinion helps us and other shoppers. Thanks!</i>',
          buttons: ['⭐ Leave Review', '❌ Had an Issue'],
          time: '4:20 PM',
        },
      ]}),
    },
    {
      name: 'WhatsApp — Back in Stock',
      channel: 'whatsapp',
      subject: '🔔 Back in Stock!',
      bodyText: 'Hey {{customer_name}}! 🔔\n\nThe item you wanted is *back in stock*!\n\n🛍️ *{{product_name}}*\n💰 *{{product_price}}*\n\n⚡ Last time this sold out in 2 days.\n\n👉 Buy now: {{product_url}}',
      htmlBody: waPreview({ messages: [
        {
          type: 'image',
          content: '',
          imageGradient: 'linear-gradient(135deg,#10b981,#059669)',
          imageEmoji: '🔔',
          imageCaption: 'Hey! 🔔\n\nThe item you wanted is <b>back in stock</b>!\n\n🛍️ <b>Premium Wireless Earbuds</b>\n💰 <b>$79.99</b>\n\n⚡ Last time this sold out in 2 days.',
          buttons: ['🛒 Buy Now', '👀 View Details'],
          time: '11:15 AM',
        },
      ]}),
    },
  ]
}
