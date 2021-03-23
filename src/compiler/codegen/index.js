/* @flow */

import { genHandlers } from './events'
import baseDirectives from '../directives/index'
import { camelize, no, extend } from 'shared/util'
import { baseWarn, pluckModuleFunction } from '../helpers'
import { emptySlotScopeToken } from '../parser/index'

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (el: ASTElement, dir: ASTDirective, warn: Function) => boolean;

/**
 * 代码生成状态类(code generate state)
 */
export class CodegenState {

  // 编译配置项
  options: CompilerOptions;
  
  // 警告函数
  warn: Function;

  // 转换函数
  // 调用modules中的transformCode
  // |> transformCode暂不存在，可看做后续铺垫属性
  transforms: Array<TransformFunction>;

  // module中的data生成函数
  // |> 目前主要是生成class和style相关的数据
  dataGenFns: Array<DataGenFunction>;

  // bind,cloak,html,model,on,text -> 绑定的指令
  // 继承的基础指令(on、bind和cloak)和编译指令(model、text和html)
  directives: { [key: string]: DirectiveFunction };
  maybeComponent: (el: ASTElement) => boolean;
  onceId: number;

  // 静态渲染函数数组
  staticRenderFns: Array<string>;
  pre: boolean;

  constructor (options: CompilerOptions) {
    this.options = options
    this.warn = options.warn || baseWarn
    this.transforms = pluckModuleFunction(options.modules, 'transformCode')
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData')
    this.directives = extend(extend({}, baseDirectives), options.directives)
    const isReservedTag = options.isReservedTag || no
    this.maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)
    this.onceId = 0
    this.staticRenderFns = []
    this.pre = false
  }
}

export type CodegenResult = {
  render: string,
  staticRenderFns: Array<string>
};

export function generate (
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  
  // 初始化代码生成状态类
  const state = new CodegenState(options)

  // 判断抽象语法树AST是否存在
  // |> 存在则调用genElement生成元素
  // |> 返回 _c("div") 的字符串
  // |> _c 是 createELement，在initRender中定义
  const code = ast ? genElement(ast, state) : '_c("div")'
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}


/**
 * 生成元素节点的生成代码函数的字符
 */
export function genElement (el: ASTElement, state: CodegenState): string {
  // 父元素存在
  // 则设置当前元素的pre状态等同于父元素的pre状态
  // pre -> 使用v-pre 或 pre标签
  if (el.parent) {
    el.pre = el.pre || el.parent.pre
  }

  // 静态根节点且未处理过
  if (el.staticRoot && !el.staticProcessed) {
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    return genSlot(el, state)
  } else {

    // 组件或普通元素
    let code

    // 组件
    if (el.component) {
      code = genComponent(el.component, el, state)
    } else {
      // 普通元素

      let data
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        data = genData(el, state)
      }

      // 校检el.inlineTemplate的结果
      // |> true -> null
      // |> false -> genChildren生成子节点代码
      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }

    // module转换
    // 调用modules中的transformCode
    // |> transformCode暂不存在，可看做后续铺垫属性
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code
  }
}

/**
 * 生成静态节点代码
 */
function genStatic (el: ASTElement, state: CodegenState): string {

  // 把当前节点的静态处理(staticProcessed)标记为true
  el.staticProcessed = true
  

  // 某些元素（模板）在v-pre节点内部需要具有不同的行为。 
  // |> 所有pre节点都是静态根节点，
  // |> 因此我们可以缓存原始状态，然后用新状态去生成静态代码，并在退出pre节点时将其重置。

  // 缓存原始状态节点
  const originalPreState = state.pre
  if (el.pre) {
    state.pre = el.pre
  }

  // 用state的新状态，去生成代码，添加到静态渲染函数staticRenderFns中
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)

  // 重置state.pre为原始状态
  state.pre = originalPreState

  // |> state.staticRenderFns.length - 1 -> 代表新添加的静态渲染函数
  // |> el.staticInFor -> 是否为在v-for下的静态节点
  // |> _m 来自installRenderHelpers阶段中引入的renderStatic函数
  return `_m(${
    state.staticRenderFns.length - 1
  }${
    el.staticInFor ? ',true' : ''
  })`
}

/**
 * 生成v-once相关代码
 * |> 1.处理v-if特殊情况
 * |> 2.处理v-for特殊情况
 */
function genOnce (el: ASTElement, state: CodegenState): string {

  // 设置onceProcessed为true，表示el的once被处理过，避免二次处理
  el.onceProcessed = true

  // 如果el存在if，且if未被处理过
  // 调用genIf生成if相关代码
  if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.staticInFor) {
    // v-for下的静态节点

    let key = ''
    let parent = el.parent

    // 找出父元素的for属性，然后用key表示父元素的key属性
    while (parent) {
      if (parent.for) {
        key = parent.key
        break
      }
      parent = parent.parent
    }

    // key 属性不存在则打印⚠️信息，并调用genElement生成元素代码
    // |> 即 <div v-for="item of list"><p v-once>{{item}}</p></div>
    // |> p属性使用v-once时，首次渲染后应使用静态渲染，但作为v-for下的属性，如果不给index，无法确定哪一个子项作为静态渲染方式
    // |> 即此情况下，v-for必须添加index属性，表示v-once对应的index索引
    if (!key) {
      process.env.NODE_ENV !== 'production' && state.warn(
        `v-once can only be used inside v-for that is keyed. `,
        el.rawAttrsMap['v-once']
      )
      return genElement(el, state)
    }

    // _o 来自于installRenderHelpers中的markOnce
    return `_o(${genElement(el, state)},${state.onceId++},${key})`
  } else {
    return genStatic(el, state)
  }
}

/**
 * 生成v-if相关代码 
 * |> 设置ifProcess为true
 * |> 调用genIfConditions处理el.ifConditions，生成ifConditions条件代码
 */
export function genIf (
  el: any,
  state: CodegenState,

  // alt -> 替代， altGen -> 替代的生成函数
  altGen?: Function, 

  // altEmpty -> 替代的空文本
  altEmpty?: string
): string {
  
  // 避免重复渲染
  el.ifProcessed = true 
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}

/**
 * 生成ifConditions条件代码
 * |> 按顺序处理ifCondition中的每一个节点，并且会移出数组
 * |> 每一个节点使用三元表达式去拼接
 * |> 递归调用 genIfConditions 去处理剩下的 ifCondition
 */
function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {

  // if条件不存在，则返回
  if (!conditions.length) {
    return altEmpty || '_e()'
  }

  const condition = conditions.shift()

  // 条件存在表达式，则生成条件判断
  /**
   * 如：
   * <div>
   *    <p v-if="type === 1"></p>
   *    <p v-else-if="type === 2"></p>
   *    <p v-else></p>
   * </div>
   * 
   * 第一次时生成 " (type === 1)?_c('p'):genIfConditions( 剩下的 ifCondition )"
   * 第二次时生成 " (type === 1)?_c('p'):( type === 2?_c( 'p'):genIfConditions( 剩下的 ifCondition ) )"
   * 最后生成    " (type === 1)?_c('p'):(type === 2)?_c('p'):_c('p')"
   */
  if (condition.exp) {
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty)
    }`
  } else {
    return `${genTernaryExp(condition.block)}`
  }

  // 带上v-once的v-if应该生成像(a)?_m(0):_m(1)的代码
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
}

/**
 * 生成v-for相关代码
 * |> 针对无key情况打印⚠️信息
 * |> 生成相应代码
 */
export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {

  // 取出表达式exp，别名alias，迭代器1(iterator1)和迭代器2(iterator2)
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  // 非生产环境，标签名称不为slot，标签名称不为template，并且key不存在
  // |> 打印⚠️信息
  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  // 避免重复渲染
  el.forProcessed = true

  // _l 来自于installRenderHelpers中的renderList
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` +
    '})'
}

/**
 * 生成data代码
 */
export function genData (el: ASTElement, state: CodegenState): string {
  let data = '{'

  // 指令优先
  // 指令可能会在其他属性之前会改变它们
  const dirs = genDirectives(el, state)
  if (dirs) data += dirs + ','

  // key
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  if (el.refInFor) {
    data += `refInFor:true,`
  }
  // pre
  if (el.pre) {
    data += `pre:true,`
  }

  // 记录使用is属性的原始标签名称
  if (el.component) {
    data += `tag:"${el.tag}",`
  }

  // module中的data生成函数
  // |> 目前主要是生成class和style相关的数据
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }

  // attributes
  // 标签上属性
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }

  // DOM props
  // 非Vue中设置的props
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }

  // event handlers
  // 普通事件处理器
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }

  // 原生事件处理器
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }

  // slot target
  // 插槽，此处用作无作用域插槽
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }

  // 作用域插槽
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }

  // 处理el上的model属性
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }

  // 内联模板
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}

/**
 * 生成指令和自定义指令代码
 * |> 特殊指令 -> v-text、v-html、v-show、v-cloak和v-model
 * |> [继承的基础指令(on、bind和cloak)和编译指令(model、text和html)]会调用特定的指令生成函数
 * |> model会继续调用普通情况下的代码生成函数，生成指令渲染字符串结果
 */
function genDirectives (el: ASTElement, state: CodegenState): string | void {
  const dirs = el.directives
  if (!dirs) return
  let res = 'directives:['
  let hasRuntime = false
  let i, l, dir, needRuntime

  // 遍历指令列表
  // |> 指的是特殊指令和自定义指令
  // |> 特殊指令 -> v-text、v-html、v-show、v-cloak和v-model
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i]
    needRuntime = true

    // 获取默认的指令对应的代码生成函数
    const gen: DirectiveFunction = state.directives[dir.name]
    if (gen) {
      // 调用AST的编译时指令方法，如果还需要运行它，则返回true
      // |> 当前仅model指令还需要运行它
      // 不返回，则needRuntime即为false
      needRuntime = !!gen(el, dir, state.warn)
    }

    // 如果需要继续运行改方法，则生成指令渲染结果
    if (needRuntime) {
      hasRuntime = true
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${
        dir.arg ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}` : ''
      }${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }

  // 移除尾逗号，然后补充']'
  if (hasRuntime) {
    return res.slice(0, -1) + ']'
  }
}

function genInlineTemplate (el: ASTElement, state: CodegenState): ?string {
  const ast = el.children[0]
  if (process.env.NODE_ENV !== 'production' && (
    el.children.length !== 1 || ast.type !== 1
  )) {
    state.warn(
      'Inline-template components must have exactly one child element.',
      { start: el.start }
    )
  }
  if (ast && ast.type === 1) {
    const inlineRenderFns = generate(ast, state.options)
    return `inlineTemplate:{render:function(){${
      inlineRenderFns.render
    }},staticRenderFns:[${
      inlineRenderFns.staticRenderFns.map(code => `function(){${code}}`).join(',')
    }]}`
  }
}

function genScopedSlots (
  el: ASTElement,
  slots: { [key: string]: ASTElement },
  state: CodegenState
): string {
  // 默认情况下，作用域插槽被认为是“稳定的”，这使得只有作用域插槽的子组件可以跳过来自父代的强制更新。 
  // 但在某些情况下，
  // 例如，如果广告位包含动态名称，在其上带有v-if或v-for，则我们必须放弃这种优化措施...
  let needsForceUpdate = el.for || Object.keys(slots).some(key => {
    const slot = slots[key]
    return (
      slot.slotTargetDynamic ||
      slot.if ||
      slot.for ||

      // 存在slot的子节点
      containsSlotChild(slot) 
    )
  })

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  let needsKey = !!el.if

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    let parent = el.parent
    while (parent) {
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        needsForceUpdate = true
        break
      }
      if (parent.if) {
        needsKey = true
      }
      parent = parent.parent
    }
  }

  const generatedSlots = Object.keys(slots)
    .map(key => genScopedSlot(slots[key], state))
    .join(',')

  return `scopedSlots:_u([${generatedSlots}]${
    needsForceUpdate ? `,null,true` : ``
  }${
    !needsForceUpdate && needsKey ? `,null,false,${hash(generatedSlots)}` : ``
  })`
}

function hash(str) {
  let hash = 5381
  let i = str.length
  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0
}

function containsSlotChild (el: ASTNode): boolean {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      return true
    }
    return el.children.some(containsSlotChild)
  }
  return false
}

/**
 * 生成作用域插槽代码
 * |> 使用v-if，调用genIf处理if插槽代码
 * |> 使用v-for，调用genFor处理for插槽代码
 * |> 处理作用域插槽代码
 */
function genScopedSlot (
  el: ASTElement,
  state: CodegenState
): string {

  // 检测是否是旧式语法
  const isLegacySyntax = el.attrsMap['slot-scope']

  // 存在if、没处理过if, 并且不是旧式语法
  // 通过genIf处理if插槽
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, `null`)
  }

  // 存在for且没处理过for
  // 通过for处理for插槽
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot)
  }

  // 生成作用域字段
  const slotScope = el.slotScope === emptySlotScopeToken
    ? ``
    : String(el.slotScope)
  const fn = `function(${slotScope}){` +

    // el是否是template标签
    `return ${el.tag === 'template'

      // 使用v-if且采用旧式语法
      ? el.if && isLegacySyntax

        // 是否使用v-if
        // |> -> 调用genChildren生成子节点，否则返回undefined
        ? `(${el.if})?${genChildren(el, state) || 'undefined'}:undefined`
      
        // 使用v-if且采用旧式语法 -> false
        // |> 调用genChildren生成子节点代码
        : genChildren(el, state) || 'undefined'

    // 不是template标签
    // |> -> 调用genElement生成节点代码
      : genElement(el, state)
    }}`

  // 反向代理this.$slots上的没有作用域范围的v-slot插槽
  const reverseProxy = slotScope ? `` : `,proxy:true`
  return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`
}

/**
 * 生成子节点代码
 * |> 如果使用for，且子节点为1，标签名称不为template，并且不为slot -> 调用genElement生成代码
 * |> 遍历children，调用genNode生成代码
 * 
 * normalizationType -> 子节点数组所需的规范化
 * |> 0 -> 无序规范化
 * |> 1 -> 需要简单的规范化(可能1级嵌套数组)
 * |>2 -> 需要完全规范化
 */
export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // 优化单个for
    // 子节点数量为1，使用了v-for，标签名称不为template，并且不为slot
    // 调用genElement重新生成代码
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {

      // normalizationType -> 子节点数组规范化方式
      // 判断是否跳过检查
      const normalizationType = checkSkip
      // 判断el是否为组件
      // 1 -> 需要简单的规范化
      // 0 -> 无序规范化
        ? state.maybeComponent(el) ? `,1` : `,0`
        : ``
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }


    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0

    // 遍历children调用genNode处理节点
    const gen = altGenNode || genNode
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}

// 确定子节点数组所需的规范化
// 0 -> 无序规范化
// 1 -> 需要简单的规范化(可能1级嵌套数组)
// 2 -> 需要完全规范化
function getNormalizationType (
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0

  // 遍历子节点
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i]

    // type不为1， 即元素不为表达式，也不为文本
    if (el.type !== 1) {
      continue
    }

    // el需要规范化或者el的ifConditions中存在block需要规范的
    // |> res -> 2
    if (needsNormalization(el) ||
        (el.ifConditions && el.ifConditions.some(c => needsNormalization(c.block)))) {
      res = 2
      break
    }

    // 如果el 是组件 或 el的ifConditions中存在block是组件
    // |> res = 1
    if (maybeComponent(el) ||
        (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))) {
      res = 1
    }
  }
  return res
}


/**
 * 校检是否需要规范化
 * for不存在或tag是template或tag是slot
 */
function needsNormalization (el: ASTElement): boolean {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

/**
 * 处理节点
 * |> type = 1，说明是标签，用genElement处理
 * |> type = 3且是注释, 用genComment处理
 * |> 其他，说明是文本或表达式，用genText处理
 */
function genNode (node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) {
    return genComment(node)
  } else {
    return genText(node)
  }
}

/**
 * 处理表达式或非注释文本
 * |> type = 2,是表达式 -> text.expression
 * |> 其他，是普通文本 -> tex.tex
 */
export function genText (text: ASTText | ASTExpression): string {
  return `_v(${text.type === 2
    // 不需要使用(), 因为已经被包装在_s里了
    // |> _s 来自于installRenderHelpers中的toString
    ? text.expression 

    // transformSpecialNewlines -> 处理特殊分隔符
    : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}

export function genComment (comment: ASTText): string {
  return `_e(${JSON.stringify(comment.text)})`
}

function genSlot (el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"'
  const children = genChildren(el, state)
  let res = `_t(${slotName}${children ? `,${children}` : ''}`
  const attrs = el.attrs || el.dynamicAttrs
    ? genProps((el.attrs || []).concat(el.dynamicAttrs || []).map(attr => ({
        // slot props are camelized
        name: camelize(attr.name),
        value: attr.value,
        dynamic: attr.dynamic
      })))
    : null
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) {
    res += `,null`
  }
  if (attrs) {
    res += `,${attrs}`
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`
  }
  return res + ')'
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
function genComponent (
  componentName: string,
  el: ASTElement,
  state: CodegenState
): string {
  const children = el.inlineTemplate ? null : genChildren(el, state, true)
  return `_c(${componentName},${genData(el, state)}${
    children ? `,${children}` : ''
  })`
}

/**
 * props代码生成函数
 * ✅ 属性和Dom props
 * |> 1. 静态属性生成
 * |> 2. 动态属性生成
 */
function genProps (props: Array<ASTAttr>): string {
  let staticProps = ``
  let dynamicProps = ``

  // 遍历props
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    const value = __WEEX__
      ? generateValue(prop.value)
      : transformSpecialNewlines(prop.value)

    // 动态则添加动态Props，否则则添加静态Props
    if (prop.dynamic) {
      dynamicProps += `${prop.name},${value},`
    } else {
      staticProps += `"${prop.name}":${value},`
    }
  }
  staticProps = `{${staticProps.slice(0, -1)}}`

  // 动态属性则通过_d包裹
  // |> _d -> installRenderHelpers阶段中的bindDynamicKeys
  if (dynamicProps) {
    return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`
  } else {
    return staticProps
  }
}

/* istanbul ignore next */
function generateValue (value) {
  if (typeof value === 'string') {
    return transformSpecialNewlines(value)
  }
  return JSON.stringify(value)
}

// #3895, #4268
/**
 * 转换特殊的分隔符
 * \u2028  -> 行分割符
 * \u2029  -> 段分隔符
 * |> 少见
 */
function transformSpecialNewlines (text: string): string {
  return text
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
