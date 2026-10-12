import type { EmailBlock } from '@storees/shared'

/**
 * Email layout renderer (Email Engine Step 3).
 *
 * Turns an AI-produced BLOCK SCHEMA into an email-safe HTML template. The AI never
 * writes HTML — it only chooses blocks and copy, and this renderer owns every tag,
 * style and the brand treatment. Output is a normal template using our tokens:
 *   - static blocks (hero/paragraph/button/discount) become branded HTML with
 *     {{brand_primary_color}} / {{brand_accent}} baked in as TOKENS (resolved per
 *     send), so one generated template styles itself to the brand automatically;
 *   - dynamic blocks (cart_items/product_grid) emit the Step 1/2 send-time tokens.
 * So a generated layout flows straight through the existing send pipeline.
 */

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** A button href is either a {{token}} or an https URL; anything else → {{store_url}}. */
function safeHref(href: string): string {
  const h = String(href ?? '').trim()
  if (/^\{\{[\w]+\}\}$/.test(h)) return h
  if (/^https:\/\/[^\s"'<>]+$/i.test(h)) return h.replace(/"/g, '%22')
  return '{{store_url}}'
}

function row(inner: string, extraStyle = ''): string {
  return `<tr><td class="mob-pad" style="padding:0 48px;${extraStyle}">${inner}</td></tr>`
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case 'hero':
      return row(
        `<h1 style="margin:28px 0 8px;font-size:26px;font-weight:800;color:{{brand_primary_color}};line-height:1.25;">${esc(block.heading)}</h1>` +
        (block.subheading ? `<p style="margin:0 0 4px;font-size:15px;color:#6b7280;line-height:1.6;">${esc(block.subheading)}</p>` : ''),
      )
    case 'paragraph':
      return row(`<p style="margin:12px 0;font-size:15px;color:#374151;line-height:1.6;">${esc(block.text)}</p>`)
    case 'button':
      return row(
        `<div style="text-align:center;padding:12px 0;"><a href="${safeHref(block.href)}" style="display:inline-block;padding:15px 32px;background:{{brand_accent}};color:#ffffff;font-size:16px;font-weight:700;border-radius:10px;text-decoration:none;">${esc(block.label)}</a></div>`,
      )
    case 'cart_items':
      return row('{{cart_items}}', 'padding-top:8px;padding-bottom:8px;')
    case 'product_grid':
      return `<tr><td class="mob-pad" style="background:#faf7f2;padding:24px 40px;">` +
        (block.heading ? `<p style="margin:0 0 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8a7a63;">${esc(block.heading)}</p>` : '') +
        `{{recommended_products}}</td></tr>`
    case 'discount':
      return row(
        `<div style="margin:12px 0;border:2px dashed {{brand_accent}};border-radius:12px;padding:18px;text-align:center;">` +
        (block.text ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${esc(block.text)}</p>` : '') +
        `<p style="margin:0;font-size:22px;font-weight:800;letter-spacing:2px;color:{{brand_primary_color}};">${esc(block.code)}</p></div>`,
      )
    case 'divider':
      return row(`<div style="height:1px;background:#e5e7eb;margin:20px 0;"></div>`)
    case 'spacer':
      return `<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>`
    case 'footer_note':
      return row(`<p style="margin:12px 0;font-size:12px;color:#9ca3af;line-height:1.5;">${esc(block.text)}</p>`)
    default:
      return ''
  }
}

/** Wrap rendered block rows in a branded, responsive, email-safe shell. */
export function renderBlocksToHtml(blocks: EmailBlock[]): string {
  const body = blocks.map(renderBlock).join('\n')
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box}
  body,html{margin:0;padding:0;width:100%;background:#f0f0f5;-webkit-text-size-adjust:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
  img{border:0;display:block;max-width:100%}
  a{color:inherit}
  .wrapper{max-width:640px;margin:0 auto}
  @media only screen and (max-width:660px){
    .wrapper{width:100%!important}
    .mob-pad{padding-left:16px!important;padding-right:16px!important}
    .mob-stack{display:block!important;width:100%!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f0f0f5;">
<center>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f5;">
<tr><td style="padding:24px 16px;">
  <table role="presentation" class="wrapper" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <tr><td class="mob-pad" style="padding:22px 48px;border-bottom:1px solid #eef0f4;">{{brand_header}}</td></tr>
${body}
    <tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>
  </table>
  <table role="presentation" class="wrapper" width="640" cellpadding="0" cellspacing="0">
    <tr><td style="padding:24px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">Sent by <strong>{{store_name}}</strong></p>
      <p style="margin:0;font-size:11px;color:#b0b0b8;"><a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</center>
</body>
</html>`
}
