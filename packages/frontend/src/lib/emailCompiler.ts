import type { EmailBlock, EmailTemplate, HeaderBlockProps, TextBlockProps, ImageBlockProps, ButtonBlockProps, DividerBlockProps, SpacerBlockProps, ColumnsBlockProps, ProductBlockProps, SocialBlockProps, FooterBlockProps } from './emailTypes'

/**
 * Compile an EmailTemplate JSON into email-safe HTML.
 * Uses table-based layout with inline styles for maximum client compatibility.
 * Compatible with: Gmail, Outlook, Apple Mail, Yahoo, etc.
 */
export function compileToHtml(template: EmailTemplate): string {
  const { globalStyles: g } = template
  const blocks = template.blocks.map(b => compileBlock(b, g)).join('\n')

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
${template.previewText ? `<meta name="description" content="${esc(template.previewText)}"/>` : ''}
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  * { box-sizing:border-box; }
  body,html { margin:0; padding:0; width:100%; background:${g.bgColor}; -webkit-text-size-adjust:100%; }
  body { font-family:${g.fontFamily}; }
  img { border:0; display:block; max-width:100%; }
  a { color:inherit; }
  @media only screen and (max-width:660px) {
    .wrapper { width:100%!important; }
    .mob-pad { padding-left:16px!important; padding-right:16px!important; }
    .mob-stack { display:block!important; width:100%!important; }
    .mob-center { text-align:center!important; }
    .mob-full { width:100%!important; }
  }
</style>
${template.previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(template.previewText)}${'‌ '.repeat(50)}</div>` : ''}
</head>
<body style="margin:0;padding:0;background:${g.bgColor};">
<center>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${g.bgColor};">
<tr><td style="padding:24px 16px;">
  <table role="presentation" class="wrapper" width="${g.maxWidth}" cellpadding="0" cellspacing="0" style="background:${g.contentBgColor};border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.05);margin:0 auto;">
${blocks}
  </table>
</td></tr>
</table>
</center>
</body>
</html>`
}

function compileBlock(block: EmailBlock, g: EmailTemplate['globalStyles']): string {
  switch (block.type) {
    case 'header': return compileHeader(block.props)
    case 'text': return compileText(block.props)
    case 'image': return compileImage(block.props)
    case 'button': return compileButton(block.props)
    case 'divider': return compileDivider(block.props)
    case 'spacer': return compileSpacer(block.props)
    case 'columns': return compileColumns(block.props, g)
    case 'product': return compileProduct(block.props)
    case 'social': return compileSocial(block.props)
    case 'footer': return compileFooter(block.props)
    default: return ''
  }
}

function compileHeader(p: HeaderBlockProps): string {
  const tag = `h${p.level}`
  const sizes: Record<number, number> = { 1: 32, 2: 24, 3: 20 }
  return row(`
    <${tag} style="margin:0;font-size:${sizes[p.level]}px;font-weight:700;color:${p.color};text-align:${p.align};line-height:1.3;">
      ${p.text}
    </${tag}>
  `, '32px 40px 8px')
}

function compileText(p: TextBlockProps): string {
  return row(`
    <div style="font-size:${p.fontSize}px;color:${p.color};text-align:${p.align};line-height:1.6;">
      ${p.html}
    </div>
  `, '8px 40px')
}

function compileImage(p: ImageBlockProps): string {
  const img = `<img src="${esc(p.src)}" alt="${esc(p.alt)}" width="${p.width}" style="display:block;max-width:100%;height:auto;${p.align === 'center' ? 'margin:0 auto;' : ''}" />`
  const content = p.link ? `<a href="${esc(p.link)}" target="_blank">${img}</a>` : img
  return row(content, '8px 0')
}

function compileButton(p: ButtonBlockProps): string {
  const width = p.fullWidth ? 'display:block;width:100%;' : 'display:inline-block;'
  return row(`
    <div style="text-align:${p.align};">
      <a href="${esc(p.url)}" target="_blank" style="${width}padding:14px 32px;background:${p.bgColor};color:${p.textColor};font-size:16px;font-weight:600;text-decoration:none;border-radius:${p.borderRadius}px;text-align:center;mso-padding-alt:0;">
        <!--[if mso]><i style="letter-spacing:32px;mso-font-width:-100%;mso-text-raise:24pt">&nbsp;</i><![endif]-->
        <span style="mso-text-raise:12pt;">${esc(p.text)}</span>
        <!--[if mso]><i style="letter-spacing:32px;mso-font-width:-100%">&nbsp;</i><![endif]-->
      </a>
    </div>
  `, '16px 40px')
}

function compileDivider(p: DividerBlockProps): string {
  return row(`<hr style="border:none;border-top:${p.thickness}px solid ${p.color};margin:0;" />`, `${p.padding}px 40px`)
}

function compileSpacer(p: SpacerBlockProps): string {
  return `<tr><td style="height:${p.height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`
}

function compileColumns(p: ColumnsBlockProps, g: EmailTemplate['globalStyles']): string {
  const ratios = p.ratio.split(':').map(Number)
  const total = ratios.reduce((a, b) => a + b, 0)
  const gap = 16

  const cols = p.columns.map((colBlocks, i) => {
    const pct = Math.round((ratios[i] / total) * 100)
    const innerHtml = colBlocks.map(b => compileBlock(b, g)).join('\n')
    return `<td class="mob-stack" width="${pct}%" style="vertical-align:top;padding:0 ${i < p.columns.length - 1 ? gap / 2 : 0}px 0 ${i > 0 ? gap / 2 : 0}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${innerHtml}</table>
    </td>`
  }).join('\n')

  return `<tr><td style="padding:8px 40px;" class="mob-pad">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cols}</tr></table>
  </td></tr>`
}

function compileProduct(p: ProductBlockProps): string {
  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      ${p.imageUrl ? `<tr><td><img src="${esc(p.imageUrl)}" alt="${esc(p.productName)}" width="100%" style="display:block;" /></td></tr>` : ''}
      <tr><td style="padding:16px;">
        <h3 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1a1a2e;">${esc(p.productName)}</h3>
        ${p.description ? `<p style="margin:0 0 8px;font-size:14px;color:#6b7280;">${esc(p.description)}</p>` : ''}
        <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#4F46E5;">${esc(p.price)}</p>
        <a href="${esc(p.ctaUrl)}" target="_blank" style="display:inline-block;padding:10px 24px;background:#4F46E5;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${esc(p.ctaText)}</a>
      </td></tr>
    </table>
  `, '8px 40px')
}

function compileSocial(p: SocialBlockProps): string {
  const icons: Record<string, string> = {
    facebook: 'F', twitter: 'X', instagram: 'IG', linkedin: 'in', youtube: 'YT', whatsapp: 'WA',
  }
  const colors: Record<string, string> = {
    facebook: '#1877F2', twitter: '#000', instagram: '#E4405F', linkedin: '#0A66C2', youtube: '#FF0000', whatsapp: '#25D366',
  }
  const links = p.links.filter(l => l.url).map(l =>
    `<a href="${esc(l.url)}" target="_blank" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background:${colors[l.platform] ?? '#6b7280'};color:#fff;font-size:12px;font-weight:700;text-decoration:none;border-radius:50%;margin:0 4px;">${icons[l.platform] ?? '?'}</a>`
  ).join('\n')

  return row(`<div style="text-align:${p.align};">${links}</div>`, '16px 40px')
}

function compileFooter(p: FooterBlockProps): string {
  return `<tr><td style="padding:24px 40px;text-align:${p.align};border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">${p.text}</p>
    <p style="margin:0;font-size:11px;"><a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">${esc(p.unsubscribeText)}</a></p>
  </td></tr>`
}

// Helpers
function row(content: string, padding = '8px 40px'): string {
  return `<tr><td style="padding:${padding};" class="mob-pad">${content}</td></tr>`
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
