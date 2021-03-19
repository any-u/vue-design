/* @flow */

import he from "he";
import { parseHTML } from "./html-parser";
import { parseText } from "./text-parser";
import { parseFilters } from "./filter-parser";
import { genAssignmentCode } from "../directives/model";
import { extend, cached, no, camelize, hyphenate } from "shared/util";
import { isIE, isEdge, isServerRendering } from "core/util/env";

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex,
} from "../helpers";

export const onRE = /^@|^v-on:/;
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/;
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
const stripParensRE = /^\(|\)$/g;
const dynamicArgRE = /^\[.*\]$/;

const argRE = /:(.*)$/;
export const bindRE = /^:|^\.|^v-bind:/;
const propBindRE = /^\./;
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g;

const slotRE = /^v-slot(:|$)|^#/;

const lineBreakRE = /[\r\n]/;
const whitespaceRE = /\s+/g;

const invalidAttributeRE = /[\s"'<>\/=]/;

const decodeHTMLCached = cached(he.decode);

export const emptySlotScopeToken = `_empty_`;

// configurable state
export let warn: any;
let delimiters;
let transforms;
let preTransforms;
let postTransforms;
let platformIsPreTag;
let platformMustUseProp;
let platformGetTagNamespace;
let maybeComponent;

export function createASTElement(
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: [],
  };
}

/**
 * 将HTML字符串转换为AST抽象语法树
 */
export function parse(
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn;

  // 校检标签是否是pre标签
  platformIsPreTag = options.isPreTag || no;

  // 校检属性在标签中是否要使用元素对象原生的prop进行绑定
  platformMustUseProp = options.mustUseProp || no;

  // 获取标签命名空间
  // |> svg 标签和 math标签
  platformGetTagNamespace = options.getTagNamespace || no;

  // 校检是否是保留标签
  // 保留标签 --> html 或 svg
  const isReservedTag = options.isReservedTag || no;

  // 校检是否是组件
  // |> el上存在component属性，且不是保留标签(html/svg)
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag);

  transforms = pluckModuleFunction(options.modules, "transformNode");
  preTransforms = pluckModuleFunction(options.modules, "preTransformNode");
  postTransforms = pluckModuleFunction(options.modules, "postTransformNode");

  // 分隔符，默认["{{", "}}"]
  delimiters = options.delimiters;

  const stack = [];

  // 保留模版中标签之间的空格 ~~> 设为false，则模版中HTML标签之间的空格将会被忽略
  const preserveWhitespace = options.preserveWhitespace !== false;

  // 空白处理策略 值为'preserve' | 'condense'
  // |> preserve: 默认模式
  // |> condense: 
  /**
   *  <p>
   *    Welcome to <b>Vue.js</b> <i>world</i>.
   *    Have fun!
   *  </p>
   * ===>
   * <p> Welcome to <b>Vue.js</b> <i>world</i>. Have fun! </p>
   */
  const whitespaceOption = options.whitespace;

  let root;
  let currentParent;
  let inVPre = false;
  let inPre = false;
  let warned = false;

  function warnOnce(msg, range) {
    if (!warned) {
      warned = true;
      warn(msg, range);
    }
  }


  /**
   * 关闭标签元素
   * |> 1. 删除尾随空格
   * |> 2. 处理pre状态，v-pre和pre标签
   * |> 3. 根节点相关特殊处理
   * |> 4. 父节点children添加当前元素，以及当前元素的parent指向父节点
   */
  function closeElement(element) {

    // 删除元素的尾随空格字符串
    trimEndingWhitespace(element);

    // 如果没使用v-pre且元素没解析过(processed为false)
    // |> processElement解析元素
    if (!inVPre && !element.processed) {
      element = processElement(element, options);
    }

    // 检测根节点
    // |> 栈为空且element元素不是根节点root
    // 即<div v-if="foo">foo</div><div></div>
    // 此情况下当解析完第二个div时，元素element就不是根节点root
    if (!stack.length && element !== root) {

      // 允许根节点使用v-if,v-else-if和v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== "production") {
          checkRootConstraints(element);
        }
        // 添加v-else-if条件
        addIfCondition(root, {
          exp: element.elseif,
          block: element,
        });
      } else if (process.env.NODE_ENV !== "production") {
        // 元素必须包含在根节点下，如果使用v-if，必须使用v-else-if
        warnOnce(
          `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`,
          { start: element.start }
        );
      }
    }

    // 如果存在父元素，且forbidden为false，即元素未被禁止
    // forbidden -> 检验元素是否是被禁止的标签
    // |> style标签，
    // |> 或script标签、且属性集合中type不存在，或type为"text/javascript")
    if (currentParent && !element.forbidden) {
      // 元素存在elseif或else
      // |> 则把元素添加到父元素的ifConditions中
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent);
      } else {

        // 判断element是否存在slotScope, 即element是否是父元素的插槽内容
        // |> 如果是插槽内容，则把元素添加到父元素的scopeSlots中
        if (element.slotScope) {

          // |> ❓ 早期版本此处作为else-if来处理，而不是放到else语句中
          // |> ⚠️ 即slot插槽语句也会把它添加到父元素的children里
          // |> ✅ 如果slot语句使用v-if，如果添加到children里，后面v-else(-if)语句便方便查找v-if块
          const name = element.slotTarget || '"default"';
          (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[
            name
          ] = element;
        }

        // 既不是v-else(-if)语句
        // |>则该元素作为普通节点
        // |> 1. 父元素的children添加该元素
        // |> 2. 该元素的父级指向父元素
        currentParent.children.push(element);
        element.parent = currentParent;
      }
    }

    // 最后清除slot语句
    // 清除掉当前元素的子节点中的插槽节点
    element.children = element.children.filter((c) => !(c: any).slotScope);
    // 再次删除尾随空格
    trimEndingWhitespace(element);

    // 检查v-pre状态
    // |> 关闭元素时，结束v-pre状态
    // |> 即inVPre改为false
    if (element.pre) {
      inVPre = false;
    }

    // 检查pre标签
    // |> 关闭元素时，结束pre标签状态
    // |> 即inPre改为false
    if (platformIsPreTag(element.tag)) {
      inPre = false;
    }

    // 执行后转换
    // |> 目前后转转换不存在要转换的点
    // |> 未来考虑添加的转换点
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options);
    }
  }

  function trimEndingWhitespace(el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode;
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === " "
      ) {
        el.children.pop();
      }
    }
  }

  /**
   * 检测根节点的约束情况
   * |> 1. 根节点不能是slot或template
   * |> 2. 根节点不能使用v-for指令
   */
  function checkRootConstraints(el) {
    if (el.tag === "slot" || el.tag === "template") {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
          "contain multiple nodes.",
        { start: el.start }
      );
    }
    if (el.attrsMap.hasOwnProperty("v-for")) {
      warnOnce(
        "Cannot use v-for on stateful component root element because " +
          "it renders multiple elements.",
        el.rawAttrsMap["v-for"]
      );
    }
  }

  parseHTML(template, {

    // ⚠️打印函数
    warn,

    // 是否期望和浏览器器保证一致
    // |>web平台设为true
    expectHTML: options.expectHTML,

    // 校检标签是否是一元标签
    // |> <img />
    isUnaryTag: options.isUnaryTag,

    // 校检是否是左开放标签, 
    // |> 如<li> ，浏览器会自动补齐<li></li>
    // |> div必须这么写：<div></div>
    canBeLeftOpenTag: options.canBeLeftOpenTag,

    // 检测是否需要编码换行符(兼容处理)
    // |> IE会在属性值内编码换行符，而其他浏览器不会
    shouldDecodeNewlines: options.shouldDecodeNewlines,

    // 检测是否需要编码a[href]中的内容
    // Chrome会对a[href]的内容镜像编码    
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,

    // 注释
    // true时会保留渲染模板中的HTML注释
    shouldKeepComment: options.comments,
    
    // 是否需要启动某个功能
    // |> 开发时非生产环境出错时，标记出错的具体源代码位置 
    outputSourceRange: options.outputSourceRange,

    /**
     * 处理开始标签
     * |> 1. 处理命名空间 -> 修复ie svg bug
     * |> 2. 创建基本AST抽象语法树
     * |> 3. 执行预转换 -> 处理input v-model属性
     * |> 4. 针对对应属性，调用不同属性处理函数
     * |> 5. 非自闭合标签修改 [标签执行栈] 和当前父节点，自闭合标签则关闭节点
     */
    start(tag, attrs, unary, start, end) {

      // 检查命名空间，如果父级存在，则继承父级命名空间，
      const ns =
        (currentParent && currentParent.ns) || platformGetTagNamespace(tag);

      // 处理IE SVG  bug
      // |> 命名空间设置的意义
      if (isIE && ns === "svg") {
        attrs = guardIESVGBug(attrs);
      }

      // 创建基础AST抽象语法树
      let element: ASTElement = createASTElement(tag, attrs, currentParent);
      if (ns) {
        element.ns = ns;
      }

      if (process.env.NODE_ENV !== "production") {
        if (options.outputSourceRange) {
          // 非生产模式，且outputSourceRange设为true
          // 标记元素的start开始索引
          element.start = start;
          // 标记元素的end结束索引
          element.end = end;
          // 设置元素的原始属性集合
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr;
            return cumulated;
          }, {});
        }
        // 检验属性名称，如非法则打印⚠️信息
        attrs.forEach((attr) => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
                `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length,
              }
            );
          }
        });
      }

      // 校检元素是否是被禁止的标签、且非SSR环境
      // |> style标签，
      // |> 或script标签、且属性集合中type不存在，或type为"text/javascript")
      // --> 设置元素forbidden 为true, 且打印⚠️信息
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true;
        process.env.NODE_ENV !== "production" &&
          warn(
            "Templates should only be responsible for mapping the state to the " +
              "UI. Avoid placing tags with side-effects in your templates, such as " +
              `<${tag}>` +
              ", as they will not be parsed.",
            { start: element.start }
          );
      }

      // 执行预转换逻辑
      // |> 目前预转换逻辑只存在对input的处理 --> 对v-model属性进行转换
      // |> 后续可在此拓展
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element;
      }

      // 校检是否处于v-pre状态
      // 全局属性，判断当前是否处于v-pre属性的环境下
      if (!inVPre) {

        // 尝试解析v-pre属性
        // 如果存在v-pre属性，则设置element.pre为true
        processPre(element);

        // 如果element.pre为true，则设置inVPre为true
        // 当前设置为v-pre环境
        if (element.pre) {
          inVPre = true;
        }
      }

      // 判断当前元素标签名是否是pre
      if (platformIsPreTag(element.tag)) {
        inPre = true;
      }

      if (inVPre) {

        // 如果是v-pre状态，处理原始属性
        processRawAttrs(element);

        // |> processed是在preTransformNode阶段添加
        // |> preTransformNode -> input v-model 中会解析v-for、v-if和v-once -> 标识processed为true
        // |> processed为true时，则不需要二次处理
        // |> 其他情况，处理v-for、v-if和v-once
      } else if (!element.processed) {

        // |>处理v-for、v-if和v-once
        processFor(element);
        processIf(element);
        processOnce(element);
      }

      // 如果根节点不存在，则把当前元素设为根节点
      // 非生产环境则校检root节点，如slot、template不能作为root节点
      if (!root) {
        root = element;
        if (process.env.NODE_ENV !== "production") {
          checkRootConstraints(root);
        }
      }

      if (!unary) {

        // 非闭合标签
        // 如<div>foo</div>，处理完<div>开始标签
        // 设置当前父元素为div，接着处理div内部逻辑,相对于foo，div就是foo文本的父级
        currentParent = element;
        stack.push(element);
      } else {

        // 自闭合标签
        // 调用closeElement关闭元素
        closeElement(element);
      }
    },

    /**
     * 处理结束标签
     * |> 1. 删除 [标签执行栈]，调整当前父节点
     * |> 2. 关闭节点
     */
    end(tag, start, end) {
      const element = stack[stack.length - 1];
      // pop stack
      stack.length -= 1;
      currentParent = stack[stack.length - 1];
      if (process.env.NODE_ENV !== "production" && options.outputSourceRange) {
        element.end = end;
      }
      closeElement(element);
    },

    /**
     * 处理纯文本
     * |> 1. 父节点元素校检是否存在
     * |> 2. IE textarea标签placeholder bug 修复
     * |> 3. 解析text，
     * |> 4. 新增AST节点，添加到父节点的children里
     * |> AST节点类型:
     *        type = 1: 普通节点类型 
     *        type = 2: 字面量表达式文本节点
     *        type = 3: 纯文本节点
     */
    chars(text: string, start: number, end: number) {
      // 校检父节点元素是否存在
      // |> 打印⚠️信息，
      // |> 如<div>foo</div>，这里的currentParent即为div
      // |> 文本不允许放在无父节点处，起码都存在个根节点
      if (!currentParent) {
        if (process.env.NODE_ENV !== "production") {
          if (text === template) {
            warnOnce(
              "Component template requires a root element, rather than just text.",
              { start }
            );
          } else if ((text = text.trim())) {
            warnOnce(`text "${text}" outside root element will be ignored.`, {
              start,
            });
          }
        }
        return;
      }

      // IE textarea标签placeholder bug 修复
      // |> 兼容处理
      if (
        isIE &&
        currentParent.tag === "textarea" &&
        currentParent.attrsMap.placeholder === text
      ) {
        return;
      }

      // 缓存当前父元素的children值
      const children = currentParent.children;
      
        // 是否在pre标签下或text移除前后空格后依然存在
      if (inPre || text.trim()) {

        // 元素标签是否是script或style
        // |> 是则不处理
        // |> 不是则调用he.decode解码下文本, 如&ne; -> ≠
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text);
      } else if (!children.length) {

        // 删除空字符串，如"    "
        text = "";
        
      // 判断是否配置了whitespaceOption 
      } else if (whitespaceOption) {
        
        if (whitespaceOption === "condense") {

          // condense模式，如果空格节点包含换行符(/r 或/n)，则删除，否则用单个空格
          text = lineBreakRE.test(text) ? "" : " ";
        } else {

          // preserve模式使用单个空格
          text = " ";
        }
      } else {
        
        // 如果preserveWhitespace设为true，则使用单个空格，false则删除空格
        text = preserveWhitespace ? " " : "";
      }

      // 如果text存在
      if (text) {
        if (!inPre && whitespaceOption === "condense") {

          // 当前标签不是pre 且为condense模式
          // 则将多个连续空格改成单个空格
          text = text.replace(whitespaceRE, " ");
        }
        let res;
        let child: ?ASTNode;
        if (

          // 当前标签未使用v-pre，
          !inVPre 
          
          // 且文本不是空字符串
          && text !== " " 

          // parseText(text,delimiters)存在
          // |> 结果赋给res
          && (res = parseText(text, delimiters))) {
          // |> type = 2 包含字面量表达式的文本节点，如{{foo}}
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text,
          };
        } else if (

          // text不为空字符串
          text !== " " ||

          // 或子节点还不存在，
          // |> 即当前文本内容是父节点的第一个子节点
          !children.length ||

          // 文本内容是空格，且文本节点的父节点有子节点，但最后一个节点不是空格
          children[children.length - 1].text !== " "
        ) {
          child = {
            type: 3,
            text,
          };
        }

        // 如果子节点存在, children添加子节点
        if (child) {
          // 非生产模式，且outputSourceRange设为true
          // 保留开始索引(start) 和 结束索引(end)
          if (
            process.env.NODE_ENV !== "production" &&
            options.outputSourceRange
          ) {
            child.start = start;
            child.end = end;
          }
          children.push(child);
        }
      }
    },

    /**
     * 处理注释节点
     * |> 1. 当前父节点的children添加ASTText子节点，类型为3
     * |> 2. 非生产环境且outputSourceRange为true，保存start开始索引和end结束索引
     */
    comment(text: string, start, end) {
      // 不允许将任何内容作为根节点的同级节点
      if (currentParent) {
        const child: ASTText = {
          type: 3,
          text,
          isComment: true,
        };
        if (
          process.env.NODE_ENV !== "production" &&
          options.outputSourceRange
        ) {
          child.start = start;
          child.end = end;
        }
        currentParent.children.push(child);
      }
    },
  });
  return root;
}

/**
 * 处理v-pre
 * |> 如果属性里存在v-pre，则将el.pre设为true
 */
function processPre(el) {
  // 如果el属性里有v-pre
  // |> 把el的pre属性设为true
  if (getAndRemoveAttr(el, "v-pre") != null) {
    el.pre = true;
  }
}

/**
 * v-pre环境下，解析原始属性
 * |> 1. 属性存在时赋值attrs
 * |> 2. 将不含属性的子节点的plain也设为true
 * |> plain设为true --> 该节点所对应的虚拟节点将不包含任何 VNodeData。
 */
function processRawAttrs(el) {
  const list = el.attrsList;
  const len = list.length;

  // attrsList 属性存在
  if (len) {

    // 新建attrs数组，并将其赋给el.attrs
    const attrs: Array<ASTAttr> = (el.attrs = new Array(len));
    for (let i = 0; i < len; i++) {

      // 遍历属性列表赋值
      attrs[i] = {
        name: list[i].name,

        // JSON.stringify作用
        // |> 确保值在解析完成后依旧为字符串
        value: JSON.stringify(list[i].value),
      };

      // 标识start开始索引、end结束索引
      // 标记作用 --> 用于出错时，可以随时查找到源代码位置(outputSourceRange设为true时)
      if (list[i].start != null) {
        attrs[i].start = list[i].start;
        attrs[i].end = list[i].end;
      }
    }
  } else if (!el.pre) {

    // |> 此函数被执行时，那肯定是v-pre条件
    // |> 且el.pre不存在，则代表<p v-pre><span></span></p>中的span
    // |> 处于v-pre环境下，且span的pre不存在
    // plain设为true --> 该节点所对应的虚拟节点将不包含任何 VNodeData。
    el.plain = true;
  }
}


/**
 * 处理元素节点
 */
export function processElement(element: ASTElement, options: CompilerOptions) {
  processKey(element);

  // 确实是否是普通元素 --> 该节点对应的虚拟节点将不包含任何VNodeData
  // |> 1. key不存在
  // |> 2. 不存在scopedSlots属性，即不存在slot
  // |> 3. 没有属性
  element.plain =
    !element.key && !element.scopedSlots && !element.attrsList.length;

  // 处理ref属性
  processRef(element);

  // 处理slot内容部分，使用插槽
  // |> 如：<template v-slot:header></template>
  processSlotContent(element);

  // 处理slot出口部分，定义插槽
  // |> 如：<slot name="header"></slot>
  processSlotOutlet(element);

  // 处理内置组件component(动态组件)
  processComponent(element);

  // 执行转换逻辑
  // |> transforms --> modules里的transformNode
  // |> 处理class属性和style属性
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element;
  }

  // 处理属性
  processAttrs(element);
  return element;
}

/**
 * 处理key属性
 * |> 从el获取key表达式，并把它绑定到el的key属性
 */
function processKey(el) {
  // 获取el上绑定的key表达式
  const exp = getBindingAttr(el, "key");
  if (exp) {

    // 非生产环境
    if (process.env.NODE_ENV !== "production") {

      // tag是template，则打印⚠️信息
      // |> template上不能使用key属性
      if (el.tag === "template") {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, "key")
        );
      }

      // |> 如果使用v-for，
      // |> 且transition-group子节点使用key属性，
      // |> v-for的index 作为key
      // 则打印⚠️信息
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1;
        const parent = el.parent;
        if (
          iterator &&
          iterator === exp &&
          parent &&
          parent.tag === "transition-group"
        ) {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
              `this is the same as not using keys.`,
            getRawBindingAttr(el, "key"),
            true /* tip */
          );
        }
      }
    }

    // 把key表达式绑定到el的key上
    el.key = exp;
  }
}


/**
 * 处理ref属性
 * |> 1. 把ref属性绑定到el上
 * |> 2. 递归遍历el的父级，检查其是否使用for属性，并把结果绑定到el的refInFor属性上
 */
function processRef(el) {
  const ref = getBindingAttr(el, "ref");
  if (ref) {
    el.ref = ref;
    
    // checkInFor -> 递归遍历el的父级，检查其是否使用for属性
    el.refInFor = checkInFor(el);
  }
}

/**
 * 处理v-for属性
 */
export function processFor(el: ASTElement) {
  let exp;

  // 从attrsList中取出v-for属性
  if ((exp = getAndRemoveAttr(el, "v-for"))) {

    // 解析v-for的表达式属性
    const res = parseFor(exp);

    // 如果res存在
    // |> 把res的值绑定到el上
    if (res) {
      extend(el, res);

      // 非正式环境，且v-for表达式非法
      // |> 打印⚠️信息
    } else if (process.env.NODE_ENV !== "production") {
      warn(`Invalid v-for expression: ${exp}`, el.rawAttrsMap["v-for"]);
    }
  }
}

type ForParseResult = {
  for: string,
  alias: string,
  iterator1?: string,
  iterator2?: string,
};

/**
 * 解析v-for后的表达式
 * |> 解析三种v-for方案
 * |> 1. item of list
 * |> 2. (item,index) of list
 * |> 3. (value,name,index) in object
 */
export function parseFor(exp: string): ?ForParseResult {

  // 正则匹配for语法, 如 "item of list"
  // |> inMatch[0] 完整匹配项 --> item of list
  // |> inMatch[1] item
  // |> inMatch[2] list
  const inMatch = exp.match(forAliasRE);
  if (!inMatch) return;
  const res = {};

  // 把值(list)绑定到res.for上
  res.for = inMatch[2].trim();

  // 如果for语法时是(item) of list，所以移除inMatch[1]的"("和")"，
  // |> 即inMatch[1]即为"(item)"
  // |> alias 即 item
  const alias = inMatch[1].trim().replace(stripParensRE, "");

  // 三种匹配方式
  // |> 1. item of list  --> null
  // |> 2. (item,index) of list --> [",index", "index"]
  // |> 3. (value,name,index) in object --> [",name,index","name","index"]
  const iteratorMatch = alias.match(forIteratorRE);
  if (iteratorMatch) {

    // 把匹配项替换成空字符串，并去除首尾空格 -> 即 item
    res.alias = alias.replace(forIteratorRE, "").trim();

    // 模式2时，iterator1 即为index
    // 模式3是，iterator1 即为name, iterator2 即为index
    res.iterator1 = iteratorMatch[1].trim();

    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim();
    }
  } else {
    // 即模式1，直接赋值alias
    res.alias = alias;
  }
  return res;
}

/**
 * 解析v-if的表达式
 * |> 1.把v-if的表达放到el.if上
 * |> 2.el的ifCondition数组添加exp和block构成的对象
 * |> 3.处理v-else和v-else-if
 */
function processIf(el) {

  // 取出el属性上v-if的表达式
  // |> 即 v-if="foo" --> exp = "foo"
  const exp = getAndRemoveAttr(el, "v-if");
  if (exp) {

    // 把表达式绑定到el的if属性上
    el.if = exp;

    // 把exp和block构成的对象添加到el的ifCondition数组里
    addIfCondition(el, {
      exp: exp,
      block: el,
    });
  } else {

    // v-else不存在，则把el的else属性设为true
    if (getAndRemoveAttr(el, "v-else") != null) {
      el.else = true;
    }

    // 把else-if的表达式放到el的elseif属性上
    const elseif = getAndRemoveAttr(el, "v-else-if");
    if (elseif) {
      el.elseif = elseif;
    }
  }
}

/**
 * 通过v-else节点查找添加v-if节点
 * |> 使用v-if的节点的ifConditions属性添加v-else的节点
 */
function processIfConditions(el, parent) {

  // 查找最近的type=1的节点, 即最近的带有v-if的节点
  const prev = findPrevElement(parent.children);
  if (prev && prev.if) {
    // 如果前一节点使用v-if属性，则把当前元素添加到前一节点的ifConditions属性上
    addIfCondition(prev, {
      exp: el.elseif,
      block: el,
    });
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `v-${el.elseif ? 'else-if="' + el.elseif + '"' : "else"} ` +
        `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? "v-else-if" : "v-else"]
    );
  }
}

/**
 * 查找最近的type=1的元素
 * |>如：<div v-if="foo">foo</div><div v-else></div>
 * |>当处理第二个div的尾元素</div>时，因为自身带有v-else属性，则调用processIfConditions
 * |>此处即查找带有v-if的元素
 * |>⚠️ type=2是字面量表达式或type=3是纯文本
 * |>所以即查找最近的type=1的元素
 */
function findPrevElement(children: Array<any>): ASTElement | void {
  let i = children.length;
  while (i--) {
    if (children[i].type === 1) {
      return children[i];
    } else {
      if (process.env.NODE_ENV !== "production" && children[i].text !== " ") {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
            `will be ignored.`,
          children[i]
        );
      }
      children.pop();
    }
  }
}

export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = [];
  }
  el.ifConditions.push(condition);
}

/**
 * 解析v-once的表达式
 * |> 1. 判断el是否存在v-once属性,存在则把el的once设为true
 */
function processOnce(el) {
  const once = getAndRemoveAttr(el, "v-once");
  if (once != null) {
    el.once = true;
  }
}

/**
 * 处理作为插槽slot传递到组件里的内容
 * 如：<template slot="xxx">, <div slot-scope="xxx">
 * |> 1. 兼容处理多版本slot API方案（递进升级）
 * |> |> 对应的值绑定到el上
 */
function processSlotContent(el) {
  let slotScope;
  if (el.tag === "template") {
    // 取出el上的scope属性
    slotScope = getAndRemoveAttr(el, "scope");
    
    // 非生产环境，且scope属性存在，则打印⚠️信息
    // |> Vue2.5版本后舍弃了scope属性，用slot-scope替代
    if (process.env.NODE_ENV !== "production" && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
        el.rawAttrsMap["scope"],
        true
      );
    }

    // 把scope属性绑定到el的slotScope上，scope属性不存在，则获取slot-scope属性
    el.slotScope = slotScope || getAndRemoveAttr(el, "slot-scope");

    // el上存在slot-scope属性
  } else if ((slotScope = getAndRemoveAttr(el, "slot-scope"))) {
    
    // 元素tag名不是template，非生产环境，然后元素使用了v-for
    // |> 打印⚠️(提示)信息
    if (process.env.NODE_ENV !== "production" && el.attrsMap["v-for"]) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
        el.rawAttrsMap["slot-scope"],
        true
      );
    }
    el.slotScope = slotScope;
  }

  // --> slot="xxx"

  // 从el上取出绑定的slot表达式
  const slotTarget = getBindingAttr(el, "slot");
  if (slotTarget) {
    
    // 如果slotTarget = '""' -> el.slotTarget = '"default"' // '""' -> 保证解析后还是字符串
    // 否则 -> el.slotTarget = slotTarget
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget;

    // 如果slot属性是动态被绑定的，则代表是动态slot，即el的slotTargetDynamic设为true
    el.slotTargetDynamic = !!(
      el.attrsMap[":slot"] || el.attrsMap["v-bind:slot"]
    );
    
    // 如果tag不是template，且slotScope不存在, 
    // |> 则给el添加slot属性，作为元素的shadow DOM(隐藏DOM元素，如Chrome滚动条的Dom元素)
    // |> tag不是template，即普通属性
    // |> slotScope不存在，则不存在作用域
    if (el.tag !== "template" && !el.slotScope) {
      addAttr(el, "slot", slotTarget, getRawBindingAttr(el, "slot"));
    }
  }

  // Vue 2.6 v-slot新语法
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === "template") {
      
      // -> v-slot on <template>

      // 通过正则从el.attrsList中取出绑定的值
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {

        // 非生产环境打印⚠️信息
        if (process.env.NODE_ENV !== "production") {
          if (el.slotTarget || el.slotScope) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
                `the receiving component`,
              el
            );
          }
        }

        // 获取slot的名称name，以及是否动态dynamic
        const { name, dynamic } = getSlotName(slotBinding);
        el.slotTarget = name;
        el.slotTargetDynamic = dynamic;
        el.slotScope = slotBinding.value || emptySlotScopeToken; // force it into a scoped slot for perf
      }
    } else {
      //  -> v-slot on component, denotes default slot

      // 通过正则从el.attrsList中取出绑定的值
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {

        // 非生产环境打印⚠️信息
        if (process.env.NODE_ENV !== "production") {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            );
          }
          if (el.slotScope || el.slotTarget) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el);
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
                `<template> syntax when there are other named slots.`,
              slotBinding
            );
          }
        }
        // -> 把组件的子类节点添加到它的默认插槽slot里

        // 取出el上的scopedSlots或者初始化scopedSlots = {}
        const slots = el.scopedSlots || (el.scopedSlots = {});

        // 获取slot的名称name，以及是否动态dynamic
        const { name, dynamic } = getSlotName(slotBinding);

        // 创建slot节点的包含器，即父级AST节点
        const slotContainer = (slots[name] = createASTElement(
          "template",
          [],
          el
        ));
        slotContainer.slotTarget = name;
        slotContainer.slotTargetDynamic = dynamic;
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer;
            return true;
          }
        });
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken;
        // remove children as they are returned from scopedSlots now

        // 删除从scopedSlots返回的子节点
        el.children = [];

        // 将el标记为非普通节点，以便生出数据
        // |> plain = true --> 该节点所对应的虚拟节点将不包含任何 VNodeData。
        el.plain = false;
      }
    }
  }
}

function getSlotName(binding) {
  let name = binding.name.replace(slotRE, "");
  if (!name) {
    if (binding.name[0] !== "#") {
      name = "default";
    } else if (process.env.NODE_ENV !== "production") {
      warn(`v-slot shorthand syntax requires a slot name.`, binding);
    }
  }
  return dynamicArgRE.test(name)
    ? // dynamic [name]
      { name: name.slice(1, -1), dynamic: true }
    : // static name
      { name: `"${name}"`, dynamic: false };
}

/**
 * 处理<slot/>出口
 * |> 把元素的name绑定到el.slotName上
 */
function processSlotOutlet(el) {
  if (el.tag === "slot") {
    el.slotName = getBindingAttr(el, "name");
    if (process.env.NODE_ENV !== "production" && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
          `and can possibly expand into multiple elements. ` +
          `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, "key")
      );
    }
  }
}

/**
 * 处理内置组件component(动态组件)
 * |> 1. 处理is属性
 * |> 2. 处理inline-template属性
 */
function processComponent(el) {
  let binding;
  if ((binding = getBindingAttr(el, "is"))) {
    el.component = binding;
  }
  if (getAndRemoveAttr(el, "inline-template") != null) {
    el.inlineTemplate = true;
  }
}

/**
 * 处理attr属性
 */
function processAttrs(el) {
  const list = el.attrsList;
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic;

  // 遍历属性列表
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name;
    value = list[i].value;

    // 判断字符串是否是以v-、@或:开头
    // |> 即指令属性
    if (dirRE.test(name)) {
      // 标记元素是动态属性
      el.hasBindings = true;
      // 从属性中取出修饰符，如.once、.self
      modifiers = parseModifiers(name.replace(dirRE, ""));
    
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {

        // 为:foo.prop="bar"创建.foo="bar"的缩写方案
        // |> .prop修饰符 -> DOM property 绑定而不是作为 attribute 绑定
        // |> 参考[https://cn.vuejs.org/v2/api/#v-bind]
        (modifiers || (modifiers = {})).prop = true;
        name = `.` + name.slice(1).replace(modifierRE, "");
      } else if (modifiers) {

        // name -> 属性值移除修饰符
        name = name.replace(modifierRE, "");
      }

       // v-bind 指令
      if (bindRE.test(name)) {

        // 解析指令名称
        name = name.replace(bindRE, "");

        // 解析指令值
        value = parseFilters(value);

        // 判断是否是动态参数
        // |> 如 <a v-bind:[attributeName]="url"> ... </a>
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          name = name.slice(1, -1);
        }

        // 非生产环境，且值为空字符串，则打印⚠️信息
        if (
          process.env.NODE_ENV !== "production" &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          );
        }

        // 处理修饰符中.prop，.camel和.sync修饰符
        if (modifiers) {

          // 使用了.prop修饰符且非动态参数
          // |> name 驼峰化
          // |> name = innerHtml, 转成 innerHTML
          if (modifiers.prop && !isDynamic) {
            name = camelize(name);
            if (name === "innerHtml") name = "innerHTML";
          }

          // 使用了.camel修饰符且非动态
          // |> name 驼峰化
          if (modifiers.camel && !isDynamic) {
            name = camelize(name);
          }

          // 使用了.sync修饰符
          if (modifiers.sync) {

            // 生成任务代码
            // |> 内部是一个赋值功能工作，避免手动赋值
            // 此处，如value = 'foo' --> syncGen = "foo=$event"
            syncGen = genAssignmentCode(value, `$event`);
            
            // 非动态属性
            // |> 给el添加一个update:close(即: 更新close事件)的处理函数
            // |> 如果hyphenate(name) !== camelize(name)
            // |> hyphenate -> 连字符转换， 如fooBar -> foo-bar
            // |> camelize -> 驼峰转换, 即foobar -> fooBar
            // |> 二者相等，即name = foo,
            // |> 否则则添加连字符和驼峰两种更新监听函数，
            // |> 即update:foo-bar处理事件和update:fooBar处理函数
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              );
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                );
              }

            // 动态属性
            } else {
              // 直接用动态名称做更新监听事件
              // |> 即 update:[name]
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              );
            }
          }
        }

        if (
          // 使用修饰符且用了.prop修饰符
          (modifiers && modifiers.prop) ||

          // 或 非组件且属性必须使用元素对象的原生的prop进行绑定
          (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))
        ) {
          // 添加到el.props上
          addProp(el, name, value, list[i], isDynamic);
        } else {
          // 添加到el.attrs或dynamicAttrs(动态属性)上
          addAttr(el, name, value, list[i], isDynamic);
        }
      } else if (onRE.test(name)) {

        // v-on 指令
        name = name.replace(onRE, "");
        
        // 检查是否是动态属性
        isDynamic = dynamicArgRE.test(name);

        // 动态属性[<attr>]，移除"["和"]", 直接让name = <attr>
        if (isDynamic) {
          name = name.slice(1, -1);
        }

        // 给事件<name>增加事件处理器
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic);
      } else {

        // 其他指令和自定义指令
        // |> 其他指令 -> v-text、v-html、v-show、v-cloak和v-model
        name = name.replace(dirRE, "");

        // 解析属性，如自定义属性v-custom:arg
        
        // 正则匹配属性，argMatch = [':arg', 'arg']
        const argMatch = name.match(argRE);
        let arg = argMatch && argMatch[1];
        isDynamic = false;
        if (arg) {

          // name --> 'custom'
          name = name.slice(0, -(arg.length + 1));

          // 动态属性, 如v-custom:[arg]
          // |> 移除"["和"]"
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1);
            isDynamic = true;
          }
        }

        // 添加指令
        addDirective(
          el,
          name,
          rawName,
          value,
          arg,
          isDynamic,
          modifiers,
          list[i]
        );
        
        // 非生产缓存，且name是model
        // |> 检验el父标签使用了v-for指令,其父元素的alias等于v-model的value
        // |> 如 <div v-for="item of list"><input v-model="item" /></div>
        // |> 打印⚠️信息
        if (process.env.NODE_ENV !== "production" && name === "model") {
          checkForAliasModel(el, value);
        }
      }
    } else {

      // --> 非指令属性

      // 非生产环境
      if (process.env.NODE_ENV !== "production") {

        // 解析字面量表达
        // 存在则打印⚠️信息
        // |> <div id="{{ isTrue ? 'a' : 'b' }}"></div> ❌
        // |> 应为 <div :id="isTrue ? 'a' : 'b'"></div> ✅
        const res = parseText(value, delimiters);
        if (res) {
          warn(
            `${name}="${value}": ` +
              "Interpolation inside attributes has been removed. " +
              "Use v-bind or the colon shorthand instead. For example, " +
              'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          );
        }
      }

      // 添加属性信息
      addAttr(el, name, JSON.stringify(value), list[i]);

      // el不是组件，属性是muted，且使用元素对象原生的prop进行绑定
      // |> 如果使用attr, firefox不会更新muted属性
      // |> 使用props处理muted属性
      if (
        !el.component &&
        name === "muted" &&
        platformMustUseProp(el.tag, el.attrsMap.type, name)
      ) {
        addProp(el, name, "true", list[i]);
      }
    }
  }
}

function checkInFor(el: ASTElement): boolean {
  let parent = el;
  while (parent) {
    if (parent.for !== undefined) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function parseModifiers(name: string): Object | void {
  const match = name.match(modifierRE);
  if (match) {
    const ret = {};
    match.forEach((m) => {
      ret[m.slice(1)] = true;
    });
    return ret;
  }
}

function makeAttrsMap(attrs: Array<Object>): Object {
  const map = {};
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== "production" &&
      map[attrs[i].name] &&
      !isIE &&
      !isEdge
    ) {
      warn("duplicate attribute: " + attrs[i].name, attrs[i]);
    }
    map[attrs[i].name] = attrs[i].value;
  }
  return map;
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag(el): boolean {
  return el.tag === "script" || el.tag === "style";
}

function isForbiddenTag(el): boolean {
  return (
    el.tag === "style" ||
    (el.tag === "script" &&
      (!el.attrsMap.type || el.attrsMap.type === "text/javascript"))
  );
}

const ieNSBug = /^xmlns:NS\d+/;
const ieNSPrefix = /^NS\d+:/;

/* istanbul ignore next */
function guardIESVGBug(attrs) {
  const res = [];
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, "");
      res.push(attr);
    }
  }
  return res;
}

function checkForAliasModel(el, value) {
  let _el = el;
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
          `You are binding v-model directly to a v-for iteration alias. ` +
          `This will not be able to modify the v-for source array because ` +
          `writing to the alias is like modifying a function local variable. ` +
          `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap["v-model"]
      );
    }
    _el = _el.parent;
  }
}
