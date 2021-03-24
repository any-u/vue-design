/* @flow */

/**
 * 用于渲染静态树的运行时方法
 */
export function renderStatic (
  index: number,
  isInFor: boolean
): VNode | Array<VNode> {
  const cached = this._staticTrees || (this._staticTrees = [])
  let tree = cached[index]
  
  // 如果已经渲染了静态树并且不在v-for内部，则可以重用同一棵树。
  if (tree && !isInFor) {
    return tree
  }
  
  // 否则，重新渲染树
  tree = cached[index] = this.$options.staticRenderFns[index].call(
    this._renderProxy,
    null,
    this // for render fns generated for functional component templates
  )

  // 标记静态属性
  markStatic(tree, `__static__${index}`, false)
  return tree
}

/**
 * v-once的运行时方法
 * 实际上，这意味着使用唯一键将节点标记为静态。
 */
export function markOnce (
  tree: VNode | Array<VNode>,
  index: number,
  key: string
) {
  markStatic(tree, `__once__${index}${key ? `_${key}` : ``}`, true)
  return tree
}

function markStatic (
  tree: VNode | Array<VNode>,
  key: string,
  isOnce: boolean
) {

  // 如果树是数组
  // |> 则遍历树，分别标记静态节点
  if (Array.isArray(tree)) {
    for (let i = 0; i < tree.length; i++) {
      if (tree[i] && typeof tree[i] !== 'string') {
        markStaticNode(tree[i], `${key}_${i}`, isOnce)
      }
    }
  } else {
    markStaticNode(tree, key, isOnce)
  }
}

function markStaticNode (node, key, isOnce) {
  node.isStatic = true
  node.key = key
  node.isOnce = isOnce
}
