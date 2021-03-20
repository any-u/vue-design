/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * 优化程序的目标：遍历生成的模板AST树并检测纯静态的子树，即子树中不需要更改的部分。
 * 一旦检测到这些子树，我们就可以：
 * |> 1.将它们提升为常量，这样我们就不再需要在每次重新渲染时为它们创建新的节点；
 * |> 2.在patch过程中完全跳过它们。
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return

  // options.staticKeys --> 即['staticStyle', 'staticClass']
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  
  // 是否是平台保留标签
  // |> 保留标签 --> HTML上的标签, SVG
  isPlatformReservedTag = options.isReservedTag || no

  // 第一步：标记所有的非静态节点
  markStatic(root)

  // 第二步，标记所有的静态根节点
  markStaticRoots(root, false)
}

/**
 * 获取静态属性值
 * |> 如tag，plain等
 */
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

/**
 * 标记所有非静态节点
 * |> 即节点的static 标为false
 */
function markStatic (node: ASTNode) {
  
  // 通过isStatic检验node本身是否是静态节点
  node.static = isStatic(node)

  // 只有type = 1的情况，才会调整节点的static属性
  // |> type = 2, static是false
  // |> type = 3, static是true
  if (node.type === 1) {

    // 不要将组件插槽的内容设为静态。 这样可以避免
    //  1.无法更改插槽节点的组件
    //  2.静态插槽内容无法进行热重装

    // 不是保留标签(html标签或SVG) ，不是tag，且没使用inline-template
    // |> 直接返回， 不额外调整节点的static属性
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }

    // 遍历子节点，如果子节点不是静态的，则把它的static属性也设为false
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }

    // 遍历它的ifConditions中的节点，如果节点不是静态的，则把它的static属性也设为false
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

/**
 * 判断节点是否是静态节点
 * |> type = 2  -> 非静态节点, 字面量表达式节点
 * |> type = 3  -> 静态节点, 纯文本节点
 * |> type = 1，则
 * |> |> 1. pre属性为true，使用v-pre或本身是pre标签
 * |> |> 2. 或者没有绑定，没有v-if, 没有v-for, 
 * |> |>    非内建组件(slot或component)，非组件，isDirectChildOfTemplateFor检验, 且所有的属性都是静态属性
 */
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression
    return false
  }
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

/**
 * 判断节点是否不是 [template标签] 或者 [使用v-for的节点]的后代节点
 * |> template标签 -> false
 * |> 使用v-for的节点 -> true
 * |> 否则 -> false
 */
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
