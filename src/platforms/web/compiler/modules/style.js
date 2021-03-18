/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import { parseStyleText } from 'web/util/style'
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

  // 从el.attrsList中取出style属性
  const staticStyle = getAndRemoveAttr(el, 'style')
  if (staticStyle) {
    
    // 非生产环境
    if (process.env.NODE_ENV !== 'production') {

      // 解析style属性，解析成功，说明在非绑定的class属性中使用了字面量表达式，
      // |>则打印⚠️信息
      // |> 如：<div style="{{ isActive ? 'active' : '' }}"></div>
      const res = parseText(staticStyle, options.delimiters)
      if (res) {
        warn(
          `style="${staticStyle}": ` +
          'Interpolation inside attributes has been removed. ' +
          'Use v-bind or the colon shorthand instead. For example, ' +
          'instead of <div style="{{ val }}">, use <div :style="val">.',
          el.rawAttrsMap['style']
        )
      }
    }
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle))
  }

  // 查找是否绑定了style属性
  // 通过v-bind:style 或 :style方式
  const styleBinding = getBindingAttr(el, 'style', false /* getStatic */)
  if (styleBinding) {
    el.styleBinding = styleBinding
  }
}

function genData (el: ASTElement): string {
  let data = ''
  if (el.staticStyle) {
    data += `staticStyle:${el.staticStyle},`
  }
  if (el.styleBinding) {
    data += `style:(${el.styleBinding}),`
  }
  return data
}

export default {
  staticKeys: ['staticStyle'],
  transformNode,
  genData
}
