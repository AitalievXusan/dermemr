import { useState } from 'react';
import { login } from '../lib/api';
import { useT } from '../lib/i18n';
import { LangSwitch } from '../components/ui/Flags';

/** Вход в облачную версию по общему паролю клиники. */
export function LoginPage() {
  const t = useT();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await login(password);
      location.reload();
    } catch (err) {
      setError((err as Error).message === 'Неверный пароль' ? t('Неверный пароль') : `${t('Не удалось войти')}: ${(err as Error).message}`);
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__top">
          <span className="login__brand">Dermaclinic</span>
          <LangSwitch compact />
        </div>
        <h1 className="login__title">{t('Вход в DermEMR')}</h1>
        <p className="login__hint">{t('Введите пароль клиники')}</p>
        <input
          className="input login__input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label={t('Пароль')}
          placeholder={t('Пароль')}
        />
        {error && <p className="login__error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--accent btn--tall login__btn" disabled={busy || !password}>{busy ? t('Вход…') : t('Войти')}</button>
      </form>
    </div>
  );
}
