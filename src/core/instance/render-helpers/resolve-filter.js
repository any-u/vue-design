/* @flow */

import { identity, resolveAsset } from 'core/util/index'

/**
 * 加载filters资源的运行时方法
 */
export function resolveFilter (id: string): Function {
  return resolveAsset(this.$options, 'filters', id, true) || identity
}
