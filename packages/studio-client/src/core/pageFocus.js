export function onPageBlur(callback) {
  const handleBlur = () => callback();
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') callback();
  };
  window.addEventListener('blur', handleBlur);
  window.addEventListener('pagehide', handleBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('pagehide', handleBlur);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
