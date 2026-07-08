// Update toast (Phase 8b, blockdoku pattern): when a new build is waiting,
// ask — never ambush. In normal document flow styling-wise (a fixed bar,
// not a modal: no focus trap, no overlay, back button unaffected).

export const showUpdateToast = (apply: () => void): void => {
  if (document.querySelector('[data-testid=update-toast]') !== null) return; // never stack
  const toast = document.createElement('div');
  toast.className = 'update-toast';
  toast.dataset['testid'] = 'update-toast';
  const label = document.createElement('span');
  label.textContent = 'Update available';
  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'button button--primary';
  applyButton.dataset['testid'] = 'apply-update';
  applyButton.textContent = 'Update now';
  applyButton.addEventListener('click', () => {
    apply();
  });
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'button';
  dismiss.dataset['testid'] = 'dismiss-update';
  dismiss.textContent = 'Later';
  dismiss.addEventListener('click', () => {
    toast.remove();
  });
  toast.append(label, applyButton, dismiss);
  document.body.append(toast);
};
