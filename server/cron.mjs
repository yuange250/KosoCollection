import cron from 'node-cron';
import {
  countVisitsBetween,
  uniqueIpsBetween,
  topPagesBetween,
  recentFeedbackBetween,
} from './db.mjs';
import { sendWeeklyReport } from './email.mjs';

const TZ = 'Asia/Shanghai';

/** 上一完整自然周：上周一 00:00（上海）至本周一 00:00（上海）前一刻，对应 UTC 边界写入 SQLite */
function previousWeekRangeUtc() {
  const now = new Date();
  const shanghaiDate = now.toLocaleDateString('sv-SE', { timeZone: TZ });
  const [Y, M, D] = shanghaiDate.split('-').map(Number);
  const midToday = new Date(
    `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}T00:00:00+08:00`,
  );
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const daysFromMon = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] ?? 0;
  const thisMonday = new Date(midToday.getTime() - daysFromMon * 86400000);
  const prevMonday = new Date(thisMonday.getTime() - 7 * 86400000);

  const toUtcSql = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
  const endExclusive = thisMonday;
  const start = prevMonday;

  const sundayEnd = new Date(endExclusive.getTime() - 86400000);
  const labelStart = start.toLocaleDateString('zh-CN', { timeZone: TZ });
  const labelEnd = sundayEnd.toLocaleDateString('zh-CN', { timeZone: TZ });

  return {
    startUtc: toUtcSql(start),
    endExclusiveUtc: toUtcSql(endExclusive),
    labelRange: `${labelStart} ~ ${labelEnd}（上海时间，上周一至上周日）`,
  };
}

function buildReport() {
  const { startUtc, endExclusiveUtc, labelRange } = previousWeekRangeUtc();
  const totalVisits = countVisitsBetween.get(startUtc, endExclusiveUtc)?.total ?? 0;
  const uniqueVisitors = uniqueIpsBetween.get(startUtc, endExclusiveUtc)?.total ?? 0;
  const topPages = topPagesBetween.all(startUtc, endExclusiveUtc);
  const feedbacks = recentFeedbackBetween.all(startUtc, endExclusiveUtc);

  const pagesRows = topPages
    .map((r, i) => `<tr><td>${i + 1}</td><td>${r.path}</td><td>${r.cnt}</td></tr>`)
    .join('');

  const feedbackRows = feedbacks.length
    ? feedbacks
        .map(
          (f) =>
            `<tr><td>${f.name || '匿名'}</td><td>${f.email}</td><td>${f.content.slice(0, 80)}</td><td>${f.created_at}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="4">本周无新反馈</td></tr>';

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',sans-serif;color:#1e293b;max-width:640px;margin:0 auto;padding:20px">
  <h2 style="color:#0f172a">科索造物集 · 周访问报告</h2>
  <p style="color:#64748b">统计周期：${labelRange}</p>

  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr>
      <td style="padding:12px 16px;background:#f1f5f9;border-radius:8px 0 0 8px">
        <strong style="font-size:24px;color:#0f172a">${totalVisits}</strong><br>
        <span style="color:#64748b;font-size:13px">总访问量</span>
      </td>
      <td style="padding:12px 16px;background:#f1f5f9">
        <strong style="font-size:24px;color:#0f172a">${uniqueVisitors}</strong><br>
        <span style="color:#64748b;font-size:13px">独立访客 (IP)</span>
      </td>
      <td style="padding:12px 16px;background:#f1f5f9;border-radius:0 8px 8px 0">
        <strong style="font-size:24px;color:#0f172a">${feedbacks.length}</strong><br>
        <span style="color:#64748b;font-size:13px">新反馈</span>
      </td>
    </tr>
  </table>

  <h3 style="margin-top:24px">热门页面 Top 20</h3>
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <thead><tr style="background:#f8fafc;text-align:left">
      <th style="padding:6px 10px">#</th>
      <th style="padding:6px 10px">路径</th>
      <th style="padding:6px 10px">访问次数</th>
    </tr></thead>
    <tbody>${pagesRows || '<tr><td colspan="3">本周无访问记录</td></tr>'}</tbody>
  </table>

  <h3 style="margin-top:24px">本周反馈</h3>
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <thead><tr style="background:#f8fafc;text-align:left">
      <th style="padding:6px 10px">姓名</th>
      <th style="padding:6px 10px">邮箱</th>
      <th style="padding:6px 10px">内容摘要</th>
      <th style="padding:6px 10px">时间</th>
    </tr></thead>
    <tbody>${feedbackRows}</tbody>
  </table>

  <p style="margin-top:24px;color:#94a3b8;font-size:12px">— 科索造物集自动周报</p>
</body></html>`;

  const text = [
    `科索造物集 · 周访问报告`,
    `统计周期：${labelRange}`,
    ``,
    `总访问量：${totalVisits}`,
    `独立访客：${uniqueVisitors}`,
    `新反馈数：${feedbacks.length}`,
    ``,
    `热门页面：`,
    ...topPages.map((r, i) => `  ${i + 1}. ${r.path} (${r.cnt})`),
  ].join('\n');

  return { html, text };
}

export function startWeeklyCron() {
  // 每周一上午 10:00（Asia/Shanghai）
  cron.schedule(
    '0 10 * * 1',
    async () => {
      console.log('[cron] 开始生成周报…');
      try {
        const { html, text } = buildReport();
        await sendWeeklyReport(html, text);
      } catch (err) {
        console.error('[cron] 周报生成/发送失败:', err);
      }
    },
    { timezone: 'Asia/Shanghai' },
  );
  console.log('[cron] 周报定时任务已启动（每周一 10:00 CST）');
}

export { buildReport };
