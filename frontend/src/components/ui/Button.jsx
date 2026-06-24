export function Button({ children, onClick, disabled, variant = 'default', className = '', type = 'button' }) {
  const base =
    'inline-flex items-center justify-center px-4 py-2 text-[13px] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';

  const styles =
    variant === 'outline'
      ? 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
      : 'bg-slate-900 text-white hover:bg-slate-800';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
