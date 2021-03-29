/* @flow */

/**
 * 解析作用域插槽
 */
export function resolveScopedSlots (
  fns: ScopedSlotsData, // see flow/vnode
  res?: Object,
  // the following are added in 2.6
  hasDynamicKeys?: boolean,
  contentHashKey?: number
): { [key: string]: Function, $stable: boolean } {
  // 初始化设置结果
  // $stable -> 是否稳定，即没有动态属性
  res = res || { $stable: !hasDynamicKeys }
  for (let i = 0; i < fns.length; i++) {
    const slot = fns[i]
    // 判断该插槽是否是数组
    // |> 递归使用resolveScopedSlots
    if (Array.isArray(slot)) {
      resolveScopedSlots(slot, res, hasDynamicKeys)
    } else if (slot) {
      // 反向代理this.$slots商合杭没有作用域的v-slot的标记
      if (slot.proxy) {
        slot.fn.proxy = true
      }
      res[slot.key] = slot.fn
    }
  }

  // 内容hash键
  // 存储到$key上，用作缓存处理
  if (contentHashKey) {
    (res: any).$key = contentHashKey
  }
  return res
}
