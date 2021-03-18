/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

/**
 * 解析文本属性
 */
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {

  // 是否设置分隔符(默认值: ["{{", "}}"])
  // |> 是 --> 构建分隔符正则 
  // |> 否 --> 默认分隔符正则
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE

  // 匹配不到则不需要解析，即文本是纯文本
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  while ((match = tagRE.exec(text))) {
    index = match.index
    
    // 处理文本标记
    // |> 如 <p>abc{{foo}}</p> 条件下
    // |> text --> abc{{foo}}
    // |> index --> 3, lastaIndex --> 0
    if (index > lastIndex) {

      // tokenValue即为 abc{{foo}}.slice(0,3) --> abc
      // |> rawTokens添加abc ,即rawTokens = ['abc']
      rawTokens.push(tokenValue = text.slice(lastIndex, index))

      // tokens添加序列化后的tokenValue -> "'abc'", 即 tokens = ["'abc'"]
      // |> 序列化原因 -> 确保解析后它依旧是字符串
      tokens.push(JSON.stringify(tokenValue))
    }
    // -> 解析表达式部分
    // 解析表达式部分，即exp="foo"
    const exp = parseFilters(match[1].trim())

    // token添加`_s(foo)`
    tokens.push(`_s(${exp})`)

    // rawTokens添加 { '@binding': foo }
    rawTokens.push({ '@binding': exp })
    
    // 修改索引
    lastIndex = index + match[0].length
  }

  // |> 如果原始文本是abc{{foo}}def时
  // |> 经过上面处理后，lastIndex为10， 而text是13
  // |> 此时就需要添加后面的文本内容
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}
