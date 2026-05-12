// settings.js - 粉笔模考爬虫 mokao1.0 设置页

// ===== 默认模板 =====
const DEFAULT_TEMPLATES = {
  header: `\
# {{title}}
导出时间: {{export_time}}
---
**统计:** {{total}} 题 | 答对 {{correct}} | 正确率 {{accuracy}}%
---

`,

  material: `\
### 材料({{start}}-{{end}} 题)
{{text}}
{{#if images}}
{{#each images}}
![材料图]({{this}})
{{/each}}
{{/if}}

---`,

  question: `\
## {{number}}. {{#if type}}【{{type}}】{{/if}}
{{stem}}
{{#if stemImages}}
{{#each stemImages}}
![题图]({{this}})
{{/each}}
{{/if}}
{{#each options}}
{{@key}}. {{this}}
{{/each}}

**正确答案:{{correctAnswer}}**  **你的答案:{{myAnswer}}** {{#if isCorrect}}✅{{else}}❌{{/if}}

{{#if analysis}}
**解析:**
{{analysis}}
{{#if analysisImages}}
{{#each analysisImages}}
![解析图]({{this}})
{{/each}}
{{/if}}
{{/if}}
`
};

// ===== 题目可用变量 =====
const QUESTION_VARS = [
  { name: '{{number}}', desc: '题号' },
  { name: '{{type}}', desc: '题型（常识/言语/...）' },
  { name: '{{stem}}', desc: '题干' },
  { name: '{{stemImages}}', desc: '题干图片列表' },
  { name: '{{options}}', desc: '选项对象（可 #each）' },
  { name: '{{correctAnswer}}', desc: '正确答案' },
  { name: '{{myAnswer}}', desc: '你的答案' },
  { name: '{{isCorrect}}', desc: '是否答对' },
  { name: '{{analysis}}', desc: '解析' },
  { name: '{{analysisImages}}', desc: '解析图片列表' },
  { name: '{{#each options}}{{@key}}.{{this}}\n{{/each}}', desc: '选项循环（手写）' },
];

const MATERIAL_VARS = [
  { name: '{{start}}', desc: '起始题号' },
  { name: '{{end}}', desc: '结束题号' },
  { name: '{{text}}', desc: '材料文本' },
  { name: '{{images}}', desc: '图片列表' },
];

const HEADER_VARS = [
  { name: '{{title}}', desc: '考试标题' },
  { name: '{{export_time}}', desc: '导出时间' },
  { name: '{{total}}', desc: '总题数' },
  { name: '{{correct}}', desc: '答对数' },
  { name: '{{accuracy}}', desc: '正确率' },
];

// ===== 示例数据 =====
const SAMPLE_QUESTION = {
  number: 1,
  type: '常识判断',
  stem: '《晋书·宣帝纪》中说"顺理而举易为力"，下列名言与其蕴含的原理一致的是（ ）。',
  stemImages: [],
  options: { A: '劈柴不照纹，累死劈柴人', B: '天下之势，循则极，极则反', C: '仓廪实而知礼节', D: '纸上得来终觉浅' },
  correctAnswer: 'A',
  myAnswer: 'B',
  isCorrect: false,
  analysis: '本题考察马克思主义哲学原理...',
  analysisImages: [],
};

const SAMPLE_MATERIAL = {
  start: 101,
  end: 105,
  text: '2019年末全国大陆总人口...',
  images: [],
};

// ===== 工具函数 =====
function $(id) { return document.getElementById(id); }
function storageGet(key, def) {
  const v = localStorage.getItem('mokao_' + key);
  return v !== null ? JSON.parse(v) : def;
}
function storageSet(key, val) { localStorage.setItem('mokao_' + key, JSON.stringify(val)); }
function showStatus(id, msg, type) {
  const el = $(id);
  el.textContent = msg;
  el.className = 'status-msg show ' + type;
  setTimeout(() => { el.className = 'status-msg'; }, 2500);
}
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
  // 触发 input 事件更新预览
  textarea.dispatchEvent(new Event('input'));
}

// ===== 初始化 Tab =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// ===== 渲染变量标签 =====
function renderVarChips(gridId, vars, textareaId) {
  const grid = $(gridId);
  grid.innerHTML = vars.map(v =>
    `<span class="var-chip" title="${v.desc}" data-var="${v.name}">${v.name}</span>`
  ).join('');
  grid.querySelectorAll('.var-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      insertAtCursor($(textareaId), chip.dataset.var);
    });
  });
}

renderVarChips('q-var-grid', QUESTION_VARS, 'tpl-question');
renderVarChips('m-var-grid', MATERIAL_VARS, 'tpl-material');
renderVarChips('h-var-grid', HEADER_VARS, 'tpl-header');

// ===== 题目模板 =====
const tplQ = $('tpl-question');
const prevQ = $('q-preview');
const tplEngine = new TemplateEngine();

function loadQuestionTpl() {
  const saved = storageGet('tpl_question', null);
  tplQ.value = saved !== null ? saved : DEFAULT_TEMPLATES.question;
}
function updateQPreview() {
  try {
    const md = tplEngine.render(tplQ.value, SAMPLE_QUESTION);
    prevQ.textContent = md;
    tplQ.classList.remove('error');
    $('q-help').textContent = '';
  } catch (e) {
    prevQ.textContent = '❌ 模板错误: ' + e.message;
    tplQ.classList.add('error');
    $('q-help').textContent = '错误: ' + e.message;
  }
}

loadQuestionTpl();
updateQPreview();
tplQ.addEventListener('input', updateQPreview);

$('q-save').addEventListener('click', () => {
  try { tplEngine.render(tplQ.value, SAMPLE_QUESTION); } catch(e) { showStatus('q-status', '❌ 模板有语法错误: ' + e.message, 'err'); return; }
  storageSet('tpl_question', tplQ.value);
  showStatus('q-status', '✅ 题目模板已保存', 'ok');
});
$('q-reset').addEventListener('click', () => {
  tplQ.value = DEFAULT_TEMPLATES.question;
  storageSet('tpl_question', null);
  updateQPreview();
  showStatus('q-status', '已恢复默认', 'ok');
});

// ===== 材料模板 =====
const tplM = $('tpl-material');
function loadMaterialTpl() {
  const saved = storageGet('tpl_material', null);
  tplM.value = saved !== null ? saved : DEFAULT_TEMPLATES.material;
}
loadMaterialTpl();
tplM.addEventListener('input', () => {});

$('m-save').addEventListener('click', () => {
  storageSet('tpl_material', tplM.value);
  showStatus('m-status', '✅ 材料模板已保存', 'ok');
});
$('m-reset').addEventListener('click', () => {
  tplM.value = DEFAULT_TEMPLATES.material;
  storageSet('tpl_material', null);
  showStatus('m-status', '已恢复默认', 'ok');
});

// ===== 文件头部模板 =====
const tplH = $('tpl-header');
const prevH = $('h-preview');

function loadHeaderTpl() {
  const saved = storageGet('tpl_header', null);
  tplH.value = saved !== null ? saved : DEFAULT_TEMPLATES.header;
}
function updateHPreview() {
  try {
    const now = new Date();
    const headerData = {
      title: '2026上半年省考行测模考大赛（第九季）',
      export_time: now.toLocaleString('zh-CN'),
      total: 120,
      correct: 71,
      accuracy: '59.2%',
    };
    const md = tplEngine.render(tplH.value, headerData);
    prevH.textContent = md;
    tplH.classList.remove('error');
    $('h-help').textContent = '';
  } catch (e) {
    prevH.textContent = '❌ 模板错误: ' + e.message;
    tplH.classList.add('error');
    $('h-help').textContent = '错误: ' + e.message;
  }
}

loadHeaderTpl();
updateHPreview();
tplH.addEventListener('input', updateHPreview);

$('h-save').addEventListener('click', () => {
  try { tplEngine.render(tplH.value, { title: 'x', export_time: '', total: 0, correct: 0, accuracy: '' }); } catch(e) { showStatus('h-status', '❌ 模板错误: ' + e.message, 'err'); return; }
  storageSet('tpl_header', tplH.value);
  showStatus('h-status', '✅ 文件头部模板已保存', 'ok');
});
$('h-reset').addEventListener('click', () => {
  tplH.value = DEFAULT_TEMPLATES.header;
  storageSet('tpl_header', null);
  updateHPreview();
  showStatus('h-status', '已恢复默认', 'ok');
});

// ===== 通用设置 =====
$('cfg-img-mode').value = storageGet('img_mode', 'base64');
$('cfg-mat-img').value = storageGet('mat_img', 'base64');
$('cfg-sep').value = storageGet('sep', 'hr');

$('g-save').addEventListener('click', () => {
  storageSet('img_mode', $('cfg-img-mode').value);
  storageSet('mat_img', $('cfg-mat-img').value);
  storageSet('sep', $('cfg-sep').value);
  showStatus('g-status', '✅ 设置已保存', 'ok');
});
// ===== Obsidian 直存 =====
(function() {
  const obsUrl = document.getElementById('obs-url');
  const obsPath = document.getElementById('obs-vault-path');
  const obsFolder = document.getElementById('obs-folder');
  const obsFolderSel = document.getElementById('obs-folder-select');
  const obsFilename = document.getElementById('obs-filename');
  const obsEnable = document.getElementById('obs-enable');
  const obsStatusEl = document.getElementById('obs-server-status');
  const obsLastSave = document.getElementById('obs-last-save');
  const defaultUrl = 'http://localhost:8765';
  const cfgKey = 'obsidian';
  const cfg = storageGet(cfgKey, { url: defaultUrl, vaultPath: '', folder: '\u7c2a\u7b14\u6a21\u8003', filename: '\u6a21\u8003_{{date}}', enable: false });
  obsUrl.value = cfg.url || defaultUrl;
  obsPath.value = cfg.vaultPath || '';
  obsFolder.value = cfg.folder || '\u7c2a\u7b14\u6a21\u8003';
  obsFilename.value = cfg.filename || '\u6a21\u8003_{{date}}';
  obsEnable.checked = cfg.enable || false;

  async function checkServer(url) {
    obsStatusEl.textContent = '\u23f3 \u6b63\u5728\u68c0\u6d4b...';
    obsStatusEl.className = 'obs-unknown';
    try {
      const r = await fetch(url + '/config');
      const d = await r.json();
      if (d.status === 'running') {
        const vaultName = d.vault_path ? d.vault_path.split(/[\\\/]/).pop() : '(\u672a\u8bbe\u7f6e)';
        obsStatusEl.textContent = '\u2705 \u670d\u52a1\u5668\u8fd0\u884c\u4e2d (v' + (d.version || '?') + ') | Vault: ' + vaultName;
        obsStatusEl.className = 'obs-running';
        if (d.folders && d.folders.length) {
          obsFolderSel.innerHTML = '<option value="">- \u6839\u76ee\u5f55 -</option>' + d.folders.map(function(f){return '<option value="'+f+'">'+f+'</option>'}).join('');
          if (cfg.folder) obsFolderSel.value = cfg.folder;
        }
        obsLastSave.textContent = d.has_vault ? '\ud83d\udcc2 Vault \u5df2\u8fde\u63a5' : '\u26a0\ufe0f \u5c1a\u672a\u8bbe\u7f6e Vault';
        return true;
      }
    } catch(e) {
      obsStatusEl.textContent = '\u274c \u670d\u52a1\u5668\u79bb\u7ebf (\u8bf7\u786e\u4fdd mokao_obsidian_server.py \u6b63\u5728\u8fd0\u884c)';
      obsStatusEl.className = 'obs-offline';
      obsLastSave.textContent = '';
      return false;
    }
    obsStatusEl.textContent = '\u26a0\ufe0f \u670d\u52a1\u5668\u54cd\u5e94\u5f02\u5e38';
    obsStatusEl.className = 'obs-unknown';
    return false;
  }

  checkServer(cfg.url || defaultUrl);

  document.getElementById('obs-test').addEventListener('click', function(){ checkServer(obsUrl.value); });
  obsFolderSel.addEventListener('change', function(){ if(obsFolderSel.value) obsFolder.value = obsFolderSel.value; });
  obsPath.addEventListener('input', function(){ obsFolderSel.innerHTML = '<option value="">- \u6839\u76ee\u5f55 -</option>'; });

  document.getElementById('obs-save').addEventListener('click', function(){
    var newCfg = {
      url: obsUrl.value.trim() || defaultUrl,
      vaultPath: obsPath.value.trim(),
      folder: obsFolder.value.trim(),
      filename: obsFilename.value.trim() || '\u6a21\u8003_{{date}}',
      enable: obsEnable.checked
    };
    storageSet(cfgKey, newCfg);
    showStatus('obs-status', '\u2705 Obsidian \u914d\u7f6e\u5df2\u4fdd\u5b58', 'ok');
  });

  document.getElementById('obs-open-server').addEventListener('click', function(){
    window.open(obsUrl.value || defaultUrl, '_blank');
  });
})();