export const getMobilePortalTarget = (): HTMLElement => {
  if (typeof document === 'undefined') {
    throw new Error('Document is not available');
  }

  return document.getElementById('mobile-viewport-root') ?? document.body;
};
