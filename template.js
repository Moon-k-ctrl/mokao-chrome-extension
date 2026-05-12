/**
 * 轻量模板引擎 - 模仿 Obsidian Web Clipper / Handlebars 模板语法
 * 支持 {{variable}}、{{#each}}...{{/each}}、{{#if}}...{{else}}...{{/if}}
 *
 * 上下文规则（与 Handlebars 一致）：
 *   - 循环内 {{A}} 优先解析为循环项的属性（如 options.A）
 *   - {{@key}} → 当前循环的键（A/B/C）
 *   - {{@value}} → 当前循环的值（选项内容）
 *   - {{@index}} → 当前索引（0, 1, 2...）
 *   - {{../var}} → 引用父级数据
 */

class TemplateEngine {
  constructor() {
    this.cache = {};
  }

  render(template, data) {
    const compiled = this.compile(template);
    try {
      return compiled(data);
    } catch (e) {
      throw new Error('模板渲染错误: ' + e.message);
    }
  }

  /**
   * 编译模板 → 生成渲染函数
   * 返回一个函数 signature = (data) => string
   * 内部通过闭包访问 _stack 维护上下文栈
   */
  compile(template) {
    const segments = this._tokenize(template);
    // 收集所有可能用到的变量路径
    const varPaths = new Set();
    segments.forEach(s => {
      if (s.type === 'var') varPaths.add(s.value);
    });

    // 构建函数体
    const lines = ['let r = [];'];
    const _ctx = '_c'; // 当前上下文变量名
    const _stack = '_s'; // 上下文栈

    lines.push(`const ${_stack} = [data];`); // 初始化栈
    lines.push(`const ${_ctx} = () => ${_stack}[${_stack}.length - 1];`); // 栈顶即当前上下文

    const _emit = (code) => lines.push(code);
    const _getVal = (path) => {
      // path 支持 ../parent 和普通 a.b.c
      if (path.startsWith('../')) {
        const up = (path.match(/^\.\.\//g) || []).length;
        const rest = path.replace(/^(\.\.\/)+/, '');
        return `${_stack}[${_stack}.length - 1 - ${up}]${rest ? '.' + rest : ''}`;
      }
      return `${_ctx}()${path ? '.' + path : ''}`;
    };

    for (const seg of segments) {
      if (seg.type === 'text') {
        _emit(`r.push(\`${this._esc(seg.value)}\`);`);
      } else if (seg.type === 'var') {
        // 检查是否在循环内（栈深度 > 1），若是则优先查当前项
        if (seg.value.includes('.')) {
          // 嵌套属性路径 a.b.c → 先找 a，再找 a.b，再找 a.b.c
          _emit(`r.push(this._resolve(${_ctx}(), "${seg.value}") ?? "");`);
        } else {
          // 简单变量：循环内优先当前项，否则查 data
          _emit(`r.push(this._resolve(${_ctx}(), "${seg.value}") ?? "");`);
        }
      } else if (seg.type === 'each_start') {
        const expr = seg.value;
        _emit(`{`);
        _emit(`  const _eachSrc_${expr.replace(/\W/g, '_')} = this._getEach("${expr}", ${_ctx}());`);
        _emit(`  _eachSrc_${expr.replace(/\W/g, '_')}.forEach((_item, _idx) => {`);
        _emit(`    const _eachCtx_${expr.replace(/\W/g, '_')} = { ...${_ctx}(), ...(typeof _item === 'object' && _item !== null ? _item : {}), '@index': _idx };`);
        _emit(`    ${_stack}.push(_eachCtx_${expr.replace(/\W/g, '_')});`);
      } else if (seg.type === 'each_end') {
        _emit(`    ${_stack}.pop();`);
        _emit(`  });`);
        _emit(`}`);
      } else if (seg.type === 'if_start') {
        const expr = seg.value;
        _emit(`if (this._resolve(${_ctx}(), "${expr}")) {`);
      } else if (seg.type === 'else') {
        _emit(`} else {`);
      } else if (seg.type === 'if_end') {
        _emit(`}`);
      } else if (seg.type === 'special') {
        const name = seg.value;
        if (name === '@index') _emit(`r.push(_idx ?? "");`);
        else if (name === '@key') _emit(`r.push(${_ctx}()['@key'] ?? "");`);
        else if (name === '@value') _emit(`r.push(${_ctx}()['@value'] ?? "");`);
        else if (name === 'this') _emit(`r.push(${_ctx}()['@value'] ?? "");`);
      }
    }

    lines.push(`return r.join('');`);
    const body = lines.join('\n');
    return new Function('data', body);
  }

  /**
   * 分词：将模板字符串分解为文本/变量/控制块片段
   */
  _tokenize(template) {
    const result = [];
    let i = 0;
    const len = template.length;
    let depth = 0; // 跟踪循环嵌套深度（用于 {{this}} 等特殊变量）

    while (i < len) {
      const open = template.indexOf('{{', i);
      if (open === -1) {
        result.push({ type: 'text', value: template.slice(i) });
        break;
      }
      if (open > i) {
        result.push({ type: 'text', value: template.slice(i, open) });
      }
      const close = template.indexOf('}}', open);
      if (close === -1) {
        result.push({ type: 'text', value: template.slice(i) });
        break;
      }
      const tag = template.slice(open + 2, close).trim();

      // 跳过空白标签
      if (!tag) { i = close + 2; continue; }

      // 控制块
      if (tag.startsWith('#each ')) {
        result.push({ type: 'each_start', value: tag.slice(6) });
        depth++;
      } else if (tag === '/each') {
        depth--;
        result.push({ type: 'each_end', value: '' });
      } else if (tag.startsWith('#if ')) {
        result.push({ type: 'if_start', value: tag.slice(4) });
      } else if (tag === 'else') {
        result.push({ type: 'else', value: '' });
      } else if (tag === '/if') {
        result.push({ type: 'if_end', value: '' });
      }
      // 特殊变量（只在循环内有意义）
      else if (['@index', '@key', '@value', 'this'].includes(tag)) {
        result.push({ type: 'special', value: tag });
      }
      // 普通变量
      else {
        result.push({ type: 'var', value: tag });
      }

      i = close + 2;
    }
    return result;
  }

  /**
   * 解析变量的值（Handlebars 风格上下文查找）
   * 1. 优先查找当前上下文（支持 a.b.c 路径）
   * 2. 找不到才返回 undefined
   */
  _resolve(ctx, path) {
    if (!path) return ctx;
    return path.split('.').reduce((o, k) => {
      if (o && typeof o === 'object' && k in o) return o[k];
      return undefined;
    }, ctx);
  }

  /**
   * 获取 each 源数据（支持数组和对象）
   * - 数组：直接返回
   * - 对象：转为 [{key: k1, value: v1}, ...] 格式
   */
  _getEach(expr, ctx) {
    const val = this._resolve(ctx, expr);
    if (!val) return [];
    if (Array.isArray(val)) return val;
    // 对象转 entries 格式，支持 {{@key}} 和 {{@value}}
    return Object.entries(val).map(([k, v]) => ({ '@key': k, '@value': v, [k]: v }));
  }

  _esc(str) {
    return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
  }
}

window.TemplateEngine = TemplateEngine;