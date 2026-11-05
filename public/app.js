(function () {
  'use strict';

  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrf = csrfMeta ? csrfMeta.content : '';

  // Default the timezone field to the browser's zone when it still says UTC.
  const tzInput = document.querySelector('#tz-input');
  if (tzInput && (!tzInput.value || tzInput.value === 'UTC')) {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) tzInput.value = zone;
    } catch (err) {
      /* keep UTC */
    }
  }

  function syncCadence(form) {
    if (!form) return;
    const select = form.querySelector('[data-cadence]');
    const wrap = form.querySelector('[data-custom-wrap]');
    if (!select || !wrap) return;
    wrap.hidden = select.value !== 'custom';
  }

  document.querySelectorAll('form').forEach(function (form) {
    syncCadence(form);
    const select = form.querySelector('[data-cadence]');
    if (select) select.addEventListener('change', function () { syncCadence(form); });
  });

  const addButton = document.querySelector('[data-open-add]');
  if (addButton) {
    addButton.addEventListener('click', function () {
      const panel = document.querySelector('.add-panel');
      if (!panel) return;
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const field = panel.querySelector('input[name="merchant_name"]');
      if (field) field.focus();
    });
  }

  const dialog = document.getElementById('edit-dialog');
  document.querySelectorAll('[data-edit]').forEach(function (button) {
    button.addEventListener('click', function () {
      let data;
      try {
        data = JSON.parse(button.dataset.edit || '{}');
      } catch (err) {
        return;
      }
      const template = document.getElementById('edit-template');
      const wrap = document.getElementById('edit-form-wrap');
      if (!template || !wrap || !dialog) return;
      const node = template.content.firstElementChild.cloneNode(true);
      const form = node.querySelector('form');
      if (!form) return;
      form.action = '/api/subscriptions/' + encodeURIComponent(data.id);
      const fields = [
        'merchant_name',
        'merchant_key',
        'plan_name',
        'amount',
        'currency',
        'cadence',
        'custom_interval_days',
        'status',
        'next_renewal_date',
        'started_on',
        'notes',
      ];
      fields.forEach(function (name) {
        const el = form.elements.namedItem(name);
        if (el && data[name] !== undefined && data[name] !== null) {
          el.value = data[name];
        }
      });
      syncCadence(form);
      const select = form.querySelector('[data-cadence]');
      if (select) select.addEventListener('change', function () { syncCadence(form); });
      wrap.replaceChildren(node);
      dialog.showModal();
      const first = form.querySelector('input[name="merchant_name"]');
      if (first) first.focus();
    });
  });

  document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
    button.addEventListener('click', function () {
      const parent = button.closest('dialog');
      if (parent) parent.close();
    });
  });

  if (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      const message = form.dataset.confirm || 'Are you sure?';
      if (!window.confirm(message)) event.preventDefault();
    });
  });

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', async function () {
      const target = document.getElementById(button.dataset.copy);
      if (!target) return;
      const text = target.textContent || '';
      const original = button.textContent;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const helper = document.createElement('textarea');
          helper.value = text;
          document.body.appendChild(helper);
          helper.select();
          document.execCommand('copy');
          helper.remove();
        }
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = original; }, 1500);
      } catch (err) {
        button.textContent = 'Select and copy';
      }
    });
  });

  document.querySelectorAll('[data-csv-form]').forEach(function (form) {
    form.addEventListener('submit', async function (event) {
      const fileInput = form.querySelector('[data-csv-file]');
      const textarea = form.querySelector('[data-csv-text]');
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      if (file && textarea && !textarea.value.trim()) {
        event.preventDefault();
        try {
          textarea.value = await file.text();
        } catch (err) {
          textarea.value = '';
        }
        form.submit();
      }
    });
  });

  // Installable PWA: cache only public shell assets, never pages or API data.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        /* offline shell is optional */
      });
    });
  }

  // Keep the CSRF token available to any future fetch-based action.
  window.Renewly = { csrf: csrf };
})();
