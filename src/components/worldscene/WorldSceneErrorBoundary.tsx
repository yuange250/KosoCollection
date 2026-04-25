import React from 'react';
import { pushWorldSceneDiagnostic } from '@/lib/worldsceneDiagnostics';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class WorldSceneErrorBoundary extends React.Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof window !== 'undefined') {
      const payload = {
        message: error.message,
        stack: error.stack ?? null,
        componentStack: info.componentStack,
        timestamp: new Date().toISOString(),
      };
      window.localStorage.setItem('worldscene-last-error', JSON.stringify(payload));
      pushWorldSceneDiagnostic({
        type: 'error',
        message: error.message || 'react render error',
        detail: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim(),
      });
      console.error('[worldscene-error-boundary]', payload);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="worldscene-panel">
          <div className="worldscene-panel__head">
            <h3>景点面板已恢复</h3>
            <p>刚才的渲染异常已经被拦下来了，可以继续操作。</p>
          </div>
          <div className="worldscene-panel__body">
            <p className="worldscene-helper-text">
              错误信息：{this.state.error.message || '未知渲染错误'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
