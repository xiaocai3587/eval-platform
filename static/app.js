/* 评测结果查看器 · Python 版前端交互（原生 JS，无框架）
   覆盖：通用 Modal / 长文本展开 / input-output 折叠 / process_data 抽屉 /
        维度原因弹窗 / 重跑 / 文件页真实上传（选择或拖拽 .jsonl） */
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }

  /* ---------- 通用 Modal（遮罩点击 / Esc 关闭，打开时锁定背景滚动） ---------- */
  var openModal = null;
  function showModal(el) {
    openModal = el;
    el.classList.remove('hidden');
    el.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }
  function hideModal() {
    if (!openModal) return;
    openModal.classList.add('hidden');
    openModal.classList.remove('flex');
    document.body.style.overflow = '';
    openModal = null;
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-modal-open]');
    if (opener) {
      var el = qs(opener.getAttribute('data-modal-open'));
      if (el) showModal(el);
      return;
    }
    if (e.target.closest('[data-modal-close]')) { hideModal(); return; }
    // 点击遮罩（事件落在 modal 容器自身而非内容卡上）关闭
    if (openModal && e.target === openModal) hideModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideModal();
  });

  /* ---------- 长文本展开 / 收起（LongText 组件） ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="toggle-long"]');
    if (!btn) return;
    var p = btn.parentElement.querySelector('p[data-clamp]');
    if (!p) return;
    var clamps = (p.getAttribute('data-clamp') || '').split(/\s+/).filter(Boolean);
    var collapsed = clamps.length > 0 && clamps.every(function (c) { return p.classList.contains(c); });
    if (collapsed) {
      clamps.forEach(function (c) { p.classList.remove(c); });
      btn.textContent = btn.getAttribute('data-open-text');
    } else {
      clamps.forEach(function (c) { p.classList.add(c); });
      btn.textContent = btn.getAttribute('data-closed-text');
    }
  });

  /* ---------- 任务路径 input/output 展开 / 收起 ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="toggle-io"]');
    if (!btn) return;
    var box = btn.nextElementSibling;
    if (!box) return;
    var willOpen = box.classList.contains('hidden');
    box.classList.toggle('hidden', !willOpen);
    btn.textContent = willOpen ? btn.getAttribute('data-open-text') : btn.getAttribute('data-closed-text');
  });

  /* ---------- process_data 右侧浮窗 ---------- */
  var drawer = qs('#process-drawer');
  function setDrawer(open) {
    if (!drawer) return;
    drawer.classList.toggle('translate-x-full', !open);
    drawer.classList.toggle('pointer-events-none', !open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    var btn = qs('[data-action="toggle-drawer"]');
    if (btn) {
      btn.classList.toggle('border-primary-300', open);
      btn.classList.toggle('bg-primary-50', open);
      btn.classList.toggle('text-primary-700', open);
      btn.classList.toggle('border-slate-200', !open);
      btn.classList.toggle('bg-white', !open);
      btn.classList.toggle('text-slate-600', !open);
    }
  }
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-action="toggle-drawer"]');
    if (toggle && drawer) {
      setDrawer(drawer.classList.contains('translate-x-full'));
      return;
    }
    if (e.target.closest('[data-action="close-drawer"]')) setDrawer(false);
  });

  /* ---------- 维度原因弹窗（点击五维度徽章） ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="dim-modal"]');
    if (!btn) return;
    var modal = qs('#dim-modal');
    if (!modal) return;
    qs('#dim-modal-title').textContent = btn.getAttribute('data-label') + ' · 评测原因';
    qs('#dim-modal-key').textContent = btn.getAttribute('data-key');
    qs('#dim-modal-reason').textContent = btn.getAttribute('data-reason') || '无原因记录';
    var host = qs('#dim-modal-badge');
    host.innerHTML = '';
    // 徽章本体（button 内最后一个带边框的 span）克隆进弹窗
    var badge = btn.querySelector('span.rounded.border');
    if (badge) host.appendChild(badge.cloneNode(true));
    showModal(modal);
  });

  /* ---------- 重跑：POST 后约 1.5 秒刷新（等待模拟完成） ---------- */
  var rerunBtn = qs('[data-action="start-rerun"]');
  if (rerunBtn) {
    rerunBtn.addEventListener('click', function () {
      var lineNo = rerunBtn.getAttribute('data-line-no');
      var fileId = rerunBtn.getAttribute('data-file-id') || '';
      var config = (qs('#rerun-config') || {}).value || '';
      rerunBtn.disabled = true;
      rerunBtn.textContent = '重跑中…';
      fetch('/api/rerun/' + lineNo, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ config: config, file: fileId }).toString(),
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          hideModal();
          setTimeout(function () { location.reload(); }, 1500);
        })
        .catch(function () {
          rerunBtn.disabled = false;
          rerunBtn.textContent = '↻ 开始重跑';
          alert('重跑请求失败，请重试');
        });
    });
  }

  /* ---------- 文件页：真实上传（点击选择 / 拖拽），提交时显示解析中 ---------- */
  var zone = qs('#upload-zone');
  if (zone) {
    var input = qs('#upload-input', zone);
    function startUpload() {
      var text = zone.querySelector('[data-upload-text]');
      if (text) text.textContent = '正在解析文件…';
      zone.classList.add('pointer-events-none', 'opacity-60');
    }
    if (input) {
      input.addEventListener('change', function () {
        if (!input.files || !input.files.length) return;
        startUpload();
        zone.submit();
      });
    }
    ['dragover', 'dragenter'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        zone.classList.add('border-primary-400', 'bg-primary-50/50');
      });
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('border-primary-400', 'bg-primary-50/50');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('border-primary-400', 'bg-primary-50/50');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length || !input) return;
      input.files = files;
      startUpload();
      zone.submit();
    });
  }
})();
