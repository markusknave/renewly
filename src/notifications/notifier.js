import { config } from '../config.js';

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Notification failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export function createNotifier() {
  return {
    async notifyUser(user, { title, body, url }) {
      const tasks = [];

      if (config.notifyWebhookUrl) {
        tasks.push(
          postJson(config.notifyWebhookUrl, {
            title,
            text: `${title}\n${body}`,
            body,
            url: url || config.baseUrl,
            user_email: user.email,
          }).catch((err) => console.error('[notify:webhook]', err.message))
        );
      }

      if (config.resendApiKey && user.email) {
        tasks.push(
          postJson(
            'https://api.resend.com/emails',
            {
              from: config.notifyFrom,
              to: [user.email],
              subject: title,
              text: `${body}\n\n${url || config.baseUrl}`,
            },
            { authorization: `Bearer ${config.resendApiKey}` }
          ).catch((err) => console.error('[notify:email]', err.message))
        );
      }

      if (!config.production) {
        console.log(`[notify] ${user.email}: ${title} — ${body}`);
      }

      await Promise.all(tasks);
    },
  };
}
