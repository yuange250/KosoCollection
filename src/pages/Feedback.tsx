import { useState } from 'react';
import { Link } from 'react-router-dom';

export function Feedback() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMsg('');
    try {
      const base = import.meta.env.VITE_API_BASE || '';
      const res = await fetch(`${base}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, content: body }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('ok');
      setMsg('感谢提交，我们已保存您的反馈。');
      setBody('');
    } catch {
      setStatus('err');
      setMsg('提交失败，请稍后重试或检查是否已启动本地 API 服务。');
    }
  };

  return (
    <div className="page">
      <div className="page-inner prose">
        <h1>反馈建议</h1>
        <p>欢迎留下数据纠错、功能建议或合作意向。提交后写入数据库（若已配置 Supabase），本地开发时由简易 API 接收。</p>

        <form className="feedback-form" onSubmit={submit}>
          <label>
            <span>姓名（可选）</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label>
            <span>邮箱</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            <span>反馈内容</span>
            <textarea
              required
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="请尽量描述复现步骤或参考链接…"
            />
          </label>
          <div className="feedback-actions">
            <button type="submit" className="btn btn--primary" disabled={status === 'loading'}>
              {status === 'loading' ? '提交中…' : '提交'}
            </button>
          </div>
          {msg && (
            <p className={status === 'ok' ? 'feedback-ok' : 'feedback-err'} role="status">
              {msg}
            </p>
          )}
        </form>

        <p className="page-back">
          <Link to="/">← 返回首页</Link>
        </p>
      </div>
    </div>
  );
}
