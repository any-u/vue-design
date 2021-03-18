/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import {
  getAndRemoveAttr,
  getBindingAttr,
  baseWarn
} from 'compiler/helpers'

/**
 * 解析class属性
 */
function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  
  // 从el.attrsList中取出class属性
  const staticClass = getAndRemoveAttr(el, 'class')

  // 非生产环境且匹配到了class信息
  if (process.env.NODE_ENV !== 'production' && staticClass) {

    // 解析class属性，解析成功，说明在非绑定的class属性中使用了字面量表达式，则打印⚠️信息
    // |> 如：<div class="{{ isActive ? 'active' : '' }}"></div>
    const res = parseText(staticClass, options.delimiters)
    if (res) {
      warn(
        `class="${staticClass}": ` +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div class="{{ val }}">, use <div :class="val">.',
        el.rawAttrsMap['class']
      )
    }
  }

  // 如果存在class属性，则序列化class值，并保存到staticClass上
  if (staticClass) {
    el.staticClass = JSON.stringify(staticClass)
  }

  // 查找是否绑定了class属性
  // 通过v-bind:class 或 :class方式
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
  if (classBinding) {
    el.classBinding = classBinding
  }
}

function genData (el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    data += `class:${el.classBinding},`
  }
  return data
}

export default {
  staticKeys: ['staticClass'],
  transformNode,
  genData
}
