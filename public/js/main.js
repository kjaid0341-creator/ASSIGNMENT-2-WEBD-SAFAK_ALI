// Auto-dismiss flash messages
document.querySelectorAll('.alert').forEach(alert => {
  setTimeout(() => {
    alert.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    alert.style.opacity = '0';
    alert.style.transform = 'translateY(-8px)';
    setTimeout(() => alert.remove(), 500);
  }, 4000);
});

// Modal open/close
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}
// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// Active nav link highlighting
const currentPath = window.location.pathname;
document.querySelectorAll('.nav-link').forEach(link => {
  if (link.getAttribute('href') && currentPath.startsWith(link.getAttribute('href'))) {
    link.classList.add('active');
  }
});

// Confirm danger actions
document.querySelectorAll('[data-confirm]').forEach(el => {
  el.addEventListener('click', e => {
    if (!confirm(el.dataset.confirm)) e.preventDefault();
  });
});

// Simple number formatting
function formatCurrency(n) {
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// Loan instalment preview (on loan request page)
const loanForm = document.getElementById('loan-calc-form');
if (loanForm) {
  const amountInput  = document.getElementById('amount');
  const tenureInput  = document.getElementById('tenure');
  const rateDisplay  = document.getElementById('interest-rate-display');
  const previewArea  = document.getElementById('loan-preview');

  function updatePreview() {
    const P = parseFloat(amountInput.value);
    const T = parseInt(tenureInput.value);
    const R = parseFloat(rateDisplay ? rateDisplay.dataset.rate : 12);
    if (!P || !T || P <= 0 || T <= 0) { previewArea.style.display = 'none'; return; }
    const totalInterest = P * (R / 100) * (T / 12);
    const totalRepayable = P + totalInterest;
    const monthly = totalRepayable / T;
    document.getElementById('prev-principal').textContent = '₹' + P.toLocaleString('en-IN', {minimumFractionDigits: 2});
    document.getElementById('prev-interest').textContent = '₹' + totalInterest.toFixed(2);
    document.getElementById('prev-total').textContent = '₹' + totalRepayable.toFixed(2);
    document.getElementById('prev-monthly').textContent = '₹' + monthly.toFixed(2);
    previewArea.style.display = 'block';
  }

  if (amountInput) amountInput.addEventListener('input', updatePreview);
  if (tenureInput) tenureInput.addEventListener('input', updatePreview);
}
