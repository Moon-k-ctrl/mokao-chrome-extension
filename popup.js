// popup.js - MoKao v2.3.0
// 参考 Obsidian Web Clipper：属性面板 + Frontmatter + &clipboard 策略

let extractedData = null;
let pageUrl = '';
let noteProperties = {
  title: '',
  date: '',
  source: '',
  tags: '',
  score: ''
};

// ===== 日志 =====
function log(msg, type = '') {
  const el = document.getElementById('log');
  if (el) {
    el.innerHTML += `<div class="line${type ? ' ' + type : ''}">${msg}</div>`;
    el.scrollTop = el.scrollHeight;
  }
}

function updateProgress(current, total) {
  const pt = document.getElementById('progressText');
  const pb = document.getElementById('progressBar');
  if (pt) pt.textContent = `${current}/${total}`;
  if (pb) pb.style.width = (total > 0 ? Math.min(100, (current / total) * 100) : 0) + '%';
}

// ===== 图片格式化 =====
function formatImages(images, label = 'img', excludeText = '') {
  if (!images || !images.length) return [];
  return images.map(img => {
    const src = typeof img === 'string' ? img : (img.src || '');
    const alt = typeof img === 'string' ? label : (img.alt || label);
    if (!src) return '';
    if (excludeText && excludeText.includes(src)) return '';
    return `![${alt}](${src})`;
  }).filter(s => s);
}

// ===== Frontmatter 生成 =====
function generateFrontmatter(props) {
  const lines = ['---'];
  
  // 使用传入的 props（保存时从输入框读取的最新值）
  if (props.title) lines.push(`title: "${props.title.replace(/"/g, '\\"')}"`);
  if (props.date) lines.push(`date: ${props.date}`);
  if (props.source) lines.push(`source: "${props.source}"`);
  
  // tags：支持逗号/中文逗号分隔
  if (props.tags && props.tags.trim()) {
    const tags = props.tags.split(/[,，]/).map(t => t.trim()).filter(t => t);
    if (tags.length === 1) {
      lines.push(`tags: ${tags[0]}`);
    } else if (tags.length > 1) {
      lines.push('tags:');
      tags.forEach(t => lines.push(`  - ${t}`));
    }
  }
  
  // 分数
  if (props.score || props.score === 0) {
    lines.push(`score: ${props.score}`);
  }
  
  // 统计属性
  if (extractedData && extractedData.questions) {
    const total = extractedData.questions.length;
    const correct = extractedData.questions.filter(q => q.isCorrect).length;
    lines.push(`totalQuestions: ${total}`);
    lines.push(`correctCount: ${correct}`);
    lines.push(`accuracy: ${(correct / total * 100).toFixed(1)}%`);
  }
  
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ===== Markdown 生成 =====
function generateMarkdown(data, imgMode, url) {
  const L = [];
  const props = JSON.parse(localStorage.getItem('mokao_props') || '{}');

  const title = noteProperties.title || data.title || '模考';
  const now = new Date();
  const correct = data.questions.filter(q => q.isCorrect).length;
  const total = data.questions.length;

  L.push(`# ${title}`);
  
  // 内联统计（可选，如果 frontmatter 已包含）
  if (props.includeStats !== false) {
    L.push('');
    L.push(`> **统计:** ${total} 题 | 答对 ${correct} | 正确率 ${(correct / total * 100).toFixed(1)}%`);
  }
  
  L.push('');

  // 材料映射
  const matMap = {};
  const matDone = new Set();
  if (props.includeMaterials !== false && data.materials && data.materials.length) {
    data.materials.forEach((m, i) => { matMap[101 + i * 5] = m; });
  }

  for (const q of data.questions) {
    const num = q.number;
    const stem = (q.stem || '').trim();
    const opts = q.options || {};
    const oim = q.optionImageMap || q.optionImages || {};
    const ca = q.correctAnswer || '';
    const ma = q.myAnswer || '';
    const anal = (q.analysis || '').trim();
    const ok = q.isCorrect;
    const qt = q.type || '';

    // 材料
    if (matMap[num] && !matDone.has(num)) {
      const m = matMap[num];
      const mt = (m.text || '').trim();
      if (mt) { L.push(`### 材料(${num}-${num + 4} 题)`); L.push(''); L.push(mt); L.push(''); }
      formatImages(m.images || [], 'mat', mt).forEach(x => { L.push(x); L.push(''); });
      if (mt) { L.push('---'); L.push(''); }
      matDone.add(num);
    }

    // 题目
    const qtText = qt ? ` 【${qt}】` : '';
    L.push(`## ${num}.${qtText}`);
    L.push('');
    if (stem) { L.push(stem); L.push(''); }
    formatImages(q.stemImages || [], 'stem', stem).forEach(x => { L.push(x); L.push(''); });

    // 选项
    if (opts && Object.keys(opts).length) {
      Object.keys(opts).sort().forEach(letter => {
        const t = (opts[letter] || '').trim();
        if (!t) return;
        L.push(`${letter}  ${t}`);
        const optImgs = oim[letter];
        if (optImgs && optImgs.length) {
          formatImages(optImgs, letter, t).forEach(x => { L.push(''); L.push(x); });
        }
      });
      L.push('');
    }

    // 答案
    const ap = [];
    if (ca) ap.push(`**正确答案:${ca}**`);
    if (props.includeMyAnswer !== false && ma) ap.push(`**你的答案:${ma}${ok ? '  ✅' : '  ❌'}**`);
    if (ap.length) { L.push(ap.join('  ')); L.push(''); }

    // 解析
    if (props.includeAnalysis !== false && anal) {
      L.push('**解析:**');
      L.push(anal);
      L.push('');
    }
    formatImages(q.analysisImages || [], 'analysis', anal).forEach(x => { L.push(x); L.push(''); });

    L.push('---'); L.push('');
  }
  return L.join('\n');
}

function formatDateTime(d, fmt) {
  const p = n => String(n).padStart(2, '0');
  const y = d.getFullYear(), mo = p(d.getMonth()+1), dd = p(d.getDate());
  const h = p(d.getHours()), mi = p(d.getMinutes()), s = p(d.getSeconds());
  switch (fmt) {
    case 'd': return `${y}-${mo}-${dd}`;
    case 'dt2': return `${y}/${mo}/${dd} ${h}:${mi}`;
    case 'cn': return `${y}年${mo}月${dd}日 ${h}:${mi}`;
    default: return `${y}-${mo}-${dd} ${h}:${mi}:${s}`;
  }
}

// ===== 剪贴板操作 =====
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// ===== Obsidian 保存（Web Clipper &clipboard 策略）=====
function renderFilename(raw, now) {
  return raw
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

async function saveToObsidian(md) {
  const folder = '';
  const baseName = noteProperties.title || extractedData?.title || '模考';
  const finalFilename = renderFilename(baseName, new Date());

  const sizeKB = Math.round(md.length / 1024);
  log(`📦 内容大小: ${sizeKB} KB`);

  // Step 1: 复制到剪贴板
  log('📋 正在复制内容到剪贴板...');
  const copied = await copyToClipboard(md);

  if (!copied) {
    log('❌ 剪贴板写入失败', 'err');
    throw new Error('剪贴板写入失败');
  }
  log('✅ 已复制到剪贴板 (' + sizeKB + ' KB)', 'ok');

  // Step 2: 用 &clipboard 拉起 Obsidian
  log('🚀 正在拉起 Obsidian...');
  try {
    const uriPath = folder ? `${folder}/${finalFilename}` : finalFilename;
    const fallbackContent = md.length > 500
      ? '\n\n---\n\n⚠️ 剪贴板读取失败。内容过大，请使用「下载 Markdown」功能获取完整文件。'
      : encodeURIComponent(md);

    const obsidianUri = `obsidian://new?vault=&file=${encodeURIComponent(uriPath)}&clipboard&content=${fallbackContent}`;

    chrome.tabs.create({ url: obsidianUri }, tab => {
      if (chrome.runtime.lastError) {
        log('❌ 无法拉起 Obsidian: ' + chrome.runtime.lastError.message, 'err');
        log('💡 请确认已安装 Obsidian', 'warn');
      } else {
        log('✅ 已拉起 Obsidian，内容将从剪贴板读取', 'ok');
      }
    });

    return { ok: true, method: 'clipboard' };
  } catch (e) {
    log('❌ 拉起 Obsidian 失败: ' + e.message, 'err');
    throw e;
  }
}

// ===== 下载功能 =====
function downloadMarkdown(content, filename) {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  } catch (e) {
    log('❌ 下载失败: ' + e.message, 'err');
  }
}

// ===== Tab 通信 =====
async function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]));
  });
}

async function sendToTab(tabId, action, data, timeoutMs = 20000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ error: 'timeout (' + timeoutMs + 'ms)' }), timeoutMs);
    chrome.tabs.sendMessage(tabId, { action, ...data }, result => {
      clearTimeout(timer);
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : (result || {}));
    });
  });
}

// ===== 属性面板 =====
function initPropertiesPanel() {
  const panel = document.getElementById('propertiesPanel');
  const header = document.getElementById('propertiesHeader');
  
  if (header && panel) {
    header.addEventListener('click', () => {
      panel.classList.toggle('expanded');
    });
  }
  
  // 初始化日期为今天
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('propDate').value = today;
  noteProperties.date = today;
}

function updatePropertiesFromExtracted(data, url) {
  // title
  if (data.title) {
    document.getElementById('propTitle').value = data.title;
    noteProperties.title = data.title;
  }
  
  // date（默认今天）
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('propDate').value = today;
  noteProperties.date = today;
  
  // source
  if (url) {
    document.getElementById('propSource').value = url;
    noteProperties.source = url;
  }
  
  // tags 默认
  document.getElementById('propTags').value = '粉笔, 行测, 模考';
  noteProperties.tags = '粉笔, 行测, 模考';
  
  // score（自动爬取）
  if (data.score != null && !isNaN(data.score)) {
    document.getElementById('propScore').value = String(data.score);
    noteProperties.score = String(data.score);
  }
}

function getPropertiesFromInputs() {
  return {
    title: document.getElementById('propTitle')?.value?.trim() || '',
    date: document.getElementById('propDate')?.value?.trim() || '',
    source: document.getElementById('propSource')?.value?.trim() || '',
    tags: document.getElementById('propTags')?.value?.trim() || '',
    score: document.getElementById('propScore')?.value?.trim() || ''
  };
}

// ===== 主逻辑 =====
document.addEventListener('DOMContentLoaded', async () => {
  const extractBtn = document.getElementById('extractBtn');
  const saveToObsidianBtn = document.getElementById('saveToObsidianBtn');
  const downloadBtn = document.getElementById('downloadBtn');

  // 初始化属性面板
  initPropertiesPanel();
  
  // 属性输入监听
  ['propTitle', 'propDate', 'propSource', 'propTags', 'propScore'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        const key = id.replace('prop', '').toLowerCase();
        noteProperties[key] = e.target.value;
      });
    }
  });

  // 检测当前 tab
  const tab = await getCurrentTab();
  if (!tab) {
    document.getElementById('statusIcon').textContent = '❌';
    document.getElementById('statusText').textContent = '无法获取标签页';
    return;
  }
  pageUrl = tab.url || '';

  // 检测页面
  const isFenbiPage = pageUrl.match(/spa\.fenbi\.com\/ti\/exam\/(solution|report)\//);
  if (!isFenbiPage) {
    document.getElementById('statusIcon').textContent = '❌';
    document.getElementById('statusText').textContent = '不支持的页面';
    extractBtn.disabled = true;
    extractBtn.textContent = '❌ 不支持的页面';
    log('⚠️ 请在粉笔模考解析页面使用此扩展', 'warn');
    return;
  }

  document.getElementById('statusIcon').textContent = '✅';
  document.getElementById('statusText').textContent = '检测到粉笔模考页面';
  log('🔓 自动复用浏览器登录态');
  extractBtn.disabled = false;
  extractBtn.textContent = '📝 提取题目';

  // 测试 content script
  log('📡 连接 content script...');
  const test = await sendToTab(tab.id, 'ping', null, 5000);
  if (test.error) {
    document.getElementById('statusIcon').textContent = '⚠️';
    document.getElementById('statusText').textContent = '请刷新页面';
    log('错误: ' + test.error, 'err');
    log('💡 请刷新页面后重试');
    extractBtn.disabled = true;
    extractBtn.textContent = '🔄 请刷新页面';
    return;
  }
  log('✅ content script 就绪');

  // 检测题目数量
  const detect = await sendToTab(tab.id, 'detect', null, 5000);
  if (detect.isExamPage) {
    log(`📊 检测到 ${detect.questionCount} 道题目，${detect.materialCount} 个材料`);
    document.getElementById('questionCount').textContent = detect.questionCount;
    document.getElementById('statsRow').style.display = 'flex';
  } else {
    log('⚠️ 未检测到题目，请确认页面已加载完成', 'warn');
  }

  // 初始禁用保存按钮
  saveToObsidianBtn.disabled = true;
  downloadBtn.disabled = true;

  const saved = JSON.parse(localStorage.getItem('mokao_props') || '{}');

  // 设置按钮
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', e => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  // ===== 提取按钮 =====
  extractBtn.addEventListener('click', async () => {
    extractBtn.disabled = true;
    extractBtn.textContent = '🔄 提取中...';
    saveToObsidianBtn.disabled = true;
    downloadBtn.disabled = true;

    const progress = document.getElementById('progress');
    const logEl = document.getElementById('log');
    if (progress) progress.classList.add('show');
    if (logEl) logEl.style.display = 'block';

    extractedData = null;
    const imgMode = saved.imgMode || 'url';

    try {
      log('⏳ 正在滚动加载并提取题目...');
      log('   （此过程可能需要 30-60 秒，请耐心等待）');
      const result = await sendToTab(tab.id, 'extract', null, 120000);
      if (result.error) {
        log('❌ 提取失败: ' + result.error, 'err');
        extractBtn.disabled = false;
        extractBtn.textContent = '🔄 重试';
        return;
      }

      const questions = result.questions || [];
      const debug = result.debug || {};
      log(`✅ 提取 ${questions.length} 道题目`);

      let imgCount = 0;
      questions.forEach(q => {
        imgCount += (q.stemImages || []).length;
        imgCount += Object.values(q.optionImageMap || {}).flat().length;
        imgCount += (q.analysisImages || []).length;
      });
      log(`🖼️ 发现 ${imgCount} 张图片`);

      if (debug.missing?.length) log(`⚠️ 缺失题号: ${debug.missing.join(', ')}`, 'err');

      log('⏳ 正在提取材料...');
      const matResult = await sendToTab(tab.id, 'extract_materials', null, 10000);
      const materials = matResult.materials || [];
      log(`✅ 提取 ${materials.length} 个材料`);

      if (imgMode === 'base64' && imgCount > 0) {
        log('⏳ 正在下载图片...');
        updateProgress(0, 1);
        const imgResult = await sendToTab(tab.id, 'download_images', { questions, materials }, 60000);
        if (!imgResult.error) {
          for (let qi = 0; qi < questions.length; qi++) {
            const q = questions[qi];
            const sB64 = (imgResult.stemMap || {})[qi] || [];
            const oB64 = (imgResult.optMap || {})[qi] || [];
            const aB64 = (imgResult.analysisMap || {})[qi] || [];
            q.stemImages = sB64.map((b, i) => b && !b.failed ? b : (q.stemImages[i] || null)).filter(Boolean);
            q.optionImageMap = Object.fromEntries(
              Object.entries(q.optionImageMap || {}).map(([l, imgs]) => [l,
                (imgs || []).map((img, i) => {
                  const b = (oB64[l] || [])[i];
                  return b && !b.failed ? b : img;
                }).filter(Boolean)
              ])
            );
            q.analysisImages = aB64.map((b, i) => b && !b.failed ? b : (q.analysisImages[i] || null)).filter(Boolean);
          }
          log('✅ 图片下载完成');
        } else {
          log('⚠️ 图片下载失败，将使用原始 URL', 'warn');
        }
      }

      extractedData = { title: result.title, questions, materials };

      // 更新属性面板
      updatePropertiesFromExtracted(extractedData, pageUrl);
      
      // 显示检测到的试卷名称
      if (result.title && result.title !== '模考') {
        log(`📋 试卷名称: ${result.title}`, 'ok');
      }

      const sizeKB = Math.round(JSON.stringify(extractedData).length / 1024);
      log(`📊 数据大小: ~${sizeKB} KB`);

      log('✅ 提取完成！可编辑属性后保存', 'ok');
      extractBtn.disabled = false;
      extractBtn.textContent = '✅ 提取完成';
      saveToObsidianBtn.disabled = false;
      saveToObsidianBtn.style.display = '';
      downloadBtn.disabled = false;

      setTimeout(() => {
        if (extractBtn.textContent === '✅ 提取完成') {
          extractBtn.textContent = '📝 提取题目';
        }
      }, 3000);

    } catch (e) {
      log(`❌ 发生错误: ${e.message}`, 'err');
      extractBtn.disabled = false;
      extractBtn.textContent = '🔄 重试';
    }
  });

  // ===== 保存到 Obsidian =====
  saveToObsidianBtn.addEventListener('click', async () => {
    if (!extractedData) {
      log('⚠️ 请先点击「提取题目」', 'warn');
      return;
    }
    saveToObsidianBtn.disabled = true;
    saveToObsidianBtn.textContent = '🔄 保存中...';
    log('');
    log('═══ 保存到 Obsidian ═══');
    try {
      const imgMode = saved.imgMode || 'url';
      
      // 获取最新属性值
      noteProperties = getPropertiesFromInputs();
      
      // 生成 frontmatter + 正文
      const frontmatter = generateFrontmatter(noteProperties);
      const body = generateMarkdown(extractedData, imgMode, pageUrl);
      const fullContent = frontmatter + body;
      
      await saveToObsidian(fullContent);
    } catch (e) {
      log(`❌ 保存失败: ${e.message}`, 'err');
    } finally {
      saveToObsidianBtn.disabled = false;
      saveToObsidianBtn.textContent = '📖 保存到 Obsidian';
    }
  });

  // ===== 下载 Markdown =====
  downloadBtn.addEventListener('click', () => {
    if (!extractedData) {
      log('⚠️ 请先点击「提取题目」', 'warn');
      return;
    }
    downloadBtn.disabled = true;
    downloadBtn.textContent = '🔄 生成中...';
    try {
      const imgMode = saved.imgMode || 'url';
      
      // 获取最新属性值
      noteProperties = getPropertiesFromInputs();
      
      // 生成 frontmatter + 正文
      const frontmatter = generateFrontmatter(noteProperties);
      const body = generateMarkdown(extractedData, imgMode, pageUrl);
      const fullContent = frontmatter + body;
      
      const baseName = noteProperties.title || extractedData.title || '模考';
      const finalFilename = renderFilename(baseName, new Date()) + '.md';
      log(`📥 下载: ${finalFilename}`);
      downloadMarkdown(fullContent, finalFilename);
    } catch (e) {
      log(`❌ 下载失败: ${e.message}`, 'err');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '💾 下载 Markdown';
    }
  });
});
