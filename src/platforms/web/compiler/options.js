/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  // 是否期望和浏览器器保证一致
  // |> web平台设为true
  expectHTML: true, 
  modules,
  directives,

  // 校检标签是否是pre标签
  isPreTag, 

  // 校检标签是否是一元标签
  // |> <img />
  isUnaryTag,

  // 校检属性在标签中是否要使用元素对象原生的prop进行绑定
  mustUseProp, 

  // 校检是否是左开放标签, 
  // |> 如<li> ，浏览器会自动补齐<li></li>
  // |> div必须这么写：<div></div>
  canBeLeftOpenTag, 

  // 校检是否是保留标签
  // 保留标签 --> html上的标签 或 svg
  isReservedTag,

  // 获取标签命名空间
  // |> svg 标签和 math标签
  getTagNamespace,

  // ['staticClass', 'staticStyle']
  staticKeys: genStaticKeys(modules)
}
