import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.163.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'chen_the_best@163.com';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP_USER / SMTP_PASS 未配置，邮件功能不可用');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendFeedbackNotification({ name, email, content }) {
  const t = getTransporter();
  if (!t) {
    console.log('[email] 跳过反馈通知（SMTP 未配置）');
    return;
  }
  const subject = `[科索造物集] 新反馈 — ${name || '匿名用户'}`;
  const text = [
    `收到新反馈：`,
    ``,
    `姓名：${name || '（未填写）'}`,
    `邮箱：${email}`,
    `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    ``,
    `--- 内容 ---`,
    content,
    ``,
    `--- 可直接回复此邮件联系用户 ---`,
  ].join('\n');

  try {
    await t.sendMail({
      from: `"科索造物集" <${SMTP_USER}>`,
      to: NOTIFY_TO,
      replyTo: email,
      subject,
      text,
    });
    console.log('[email] 反馈通知已发送');
  } catch (err) {
    console.error('[email] 反馈通知发送失败:', err.message);
  }
}

export async function sendWeeklyReport(html, textFallback) {
  const t = getTransporter();
  if (!t) {
    console.log('[email] 跳过周报（SMTP 未配置）');
    return;
  }
  const now = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  try {
    await t.sendMail({
      from: `"科索造物集" <${SMTP_USER}>`,
      to: NOTIFY_TO,
      subject: `[科索造物集] 周访问报告 ${now}`,
      text: textFallback,
      html,
    });
    console.log('[email] 周报已发送');
  } catch (err) {
    console.error('[email] 周报发送失败:', err.message);
  }
}
