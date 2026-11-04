export type BrandedEmail = {
  subject: string;
  text: string;
  html: string;
};

export function brandedEmail(input: {
  subject: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  action?: { label: string; href: string };
}): BrandedEmail {
  const text = [
    input.title,
    ...input.paragraphs,
    input.action ? `${input.action.label}\n${input.action.href}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const action = input.action
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;background:#2c4a3e;color:#fffcf8;text-decoration:none;border-radius:999px;padding:12px 22px;font-size:14px">${escapeHtml(input.action.label)}</a></p><p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6f6a63;word-break:break-all">${escapeHtml(input.action.href)}</p>`
    : "";
  const paragraphs = input.paragraphs
    .map((paragraph) => `<p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:#1c1917">${escapeHtml(paragraph)}</p>`)
    .join("");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6f4f0;color:#1c1917">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4f0;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffcf8;border:1px solid #e6e0d6;border-radius:28px;padding:36px 32px">
            <tr>
              <td>
                <p style="margin:0;font-family:Georgia,Times,serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#6f6a63">${escapeHtml(input.eyebrow)}</p>
                <h1 style="margin:14px 0 0;font-family:Georgia,Times,serif;font-weight:400;font-size:36px;line-height:1.1;color:#1c1917">${escapeHtml(input.title)}</h1>
                <div style="font-family:Georgia,Times,serif">${paragraphs}${action}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject: input.subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
