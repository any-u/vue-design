/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from "shared/util";
import { isNonPhrasingTag } from "web/compiler/util";
import { unicodeRegExp } from "core/util/lang";

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`;
const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
const startTagOpen = new RegExp(`^<${qnameCapture}`);
const startTagClose = /^\s*(\/?)>/;
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`);
const doctype = /^<!DOCTYPE [^>]+>/i;
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/;
const conditionalComment = /^<!\[/;

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap("script,style,textarea", true);
const reCache = {};

const decodingMap = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&amp;": "&",
  "&#10;": "\n",
  "&#9;": "\t",
  "&#39;": "'",
};
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g;
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g;

// #5992
const isIgnoreNewlineTag = makeMap("pre,textarea", true);
const shouldIgnoreFirstNewline = (tag, html) =>
  tag && isIgnoreNewlineTag(tag) && html[0] === "\n";

function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr;
  return value.replace(re, (match) => decodingMap[match]);
}

export function parseHTML(html, options) {
  const stack = [];

  // 是否期望和浏览器器保证一致
  // |>web平台设为true
  const expectHTML = options.expectHTML;

  // 校检标签是否是一元标签
  // |> <img />
  const isUnaryTag = options.isUnaryTag || no;

  // 校检是否是左开放标签,
  // |> 如<li> ，浏览器会自动补齐<li></li>
  // |> div必须这么写：<div></div>
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no;
  let index = 0;
  let last, lastTag;

  // 递归遍历html字符串
  while (html) {
    last = html;

    // lastTag 不存在，或不在纯文本内容元素内，如script标签、style标签或textarea标签
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 查找<
      let textEnd = html.indexOf("<");

      // 如<div>foo</div> 此时textEnd为 0
      if (textEnd === 0) {
        // 校检是否是注释
        // |> comment ~~> <!-- 注释内容 -->
        if (comment.test(html)) {
          // 查找注释的尾部索引 ~~> -->
          const commentEnd = html.indexOf("-->");

          // 尾部注释存在
          if (commentEnd >= 0) {
            // shouldKeepComment --> 是否需要保留注释
            if (options.shouldKeepComment) {
              // parse阶段调用parseHTML的第二个参数中的comment函数 --> 处理注释
              options.comment(
                html.substring(4, commentEnd),
                index,
                index + commentEnd + 3
              );
            }

            // 移除注释部分，并修改index索引位置
            // 开始下次递归遍历模板字符串
            advance(commentEnd + 3);
            continue;
          }
        }

        // 校检是否是条件注释
        // conditionalComment ~~> <![if! IE]>  <![endif]>
        if (conditionalComment.test(html)) {
          // 查找条件注释的尾部索引 ~~> ]>
          const conditionalEnd = html.indexOf("]>");

          // 尾部条件注释存在
          if (conditionalEnd >= 0) {
            // 移除条件注释部分，并修改index索引位置
            // 开始下次递归遍历模板字符串
            advance(conditionalEnd + 2);
            continue;
          }
        }

        // 校检是否是<!DOCTYPE>标签
        const doctypeMatch = html.match(doctype);
        if (doctypeMatch) {
          // 移除doctype部分，并修改index索引位置
          // 开始下次递归遍历模板字符串
          advance(doctypeMatch[0].length);
          continue;
        }

        // 查找结束标签
        const endTagMatch = html.match(endTag);
        if (endTagMatch) {

          // 缓存当前index索引
          const curIndex = index;

          // 删除结束标签部分，并修改index位置
          advance(endTagMatch[0].length);

          // 处理结束标签
          parseEndTag(endTagMatch[1], curIndex, index);
          continue;
        }

        // 开始标签
        // 匹配开始标签
        const startTagMatch = parseStartTag();
        if (startTagMatch) {
          // 处理开始标签
          handleStartTag(startTagMatch);

          // 判断标签是否是pre或textarea，且第一个内容是换行符
          // |> 则删除换行符，并修改index索引位置
          // |> HTML历史问题，此处作兼容性处理
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1);
          }
          continue;
        }
      }

      let text, rest, next;
      
      if (textEnd >= 0) {
        // 不是以<开头, 
        // 而且即使以<开头，也不一定匹配上面的四种情况, 如 < 2 

        // 截取剩余部分内容, 从<开始
        rest = html.slice(textEnd);
        while (

          // 未找到结束标签
          !endTag.test(rest) &&

          // 未找到开始标签开始部分, 如<div
          !startTagOpen.test(rest) &&

          // 非注释
          !comment.test(rest) &&

          // 非条件节点
          !conditionalComment.test(rest)
        ) {
          // < 在纯文本中显示，将其视作文本

          // rest从<开始截取,
          // |>如 0<1<2的文本, rest即"<1<2"
          // |>next 即为文本"<1<2"中2的索引
          // ||> 第二次执行是从"<2"的第一个索引开始查找<,则next遍为-1
          next = rest.indexOf("<", 1);

          // 初次时next 存在
          // ||> 第二次时next变成-1，则跳出
          // ||>此时textEnd为之前的文本"0<1<2"中3的索引
          if (next < 0) break;

          // |> textEnd加上next，即textEnd变成文本"0<1<2"中3的索引
          textEnd += next;

          //|> rest即变成了文本"<2",重复while语句
          rest = html.slice(textEnd);
        }
        // 截取文本"0<1<2"中0~3的部分，即0<1
        text = html.substring(0, textEnd);
      }
      
      // textEnd 小于0 ，即text作为纯文本解析
      if (textEnd < 0) {
        text = html;
      }

      // text存在，则从html中删除text长度的部分，并修改index索引位置
      // |> 对于"0<1<2"，第一阶段处理"0<1"
      // |> 然后下一次while(html)，会继续处理"<2"的部分
      if (text) {
        advance(text.length);
      }

      // options.char存在，且text存在
      // |> 调用它处理纯文本
      if (options.chars && text) {
        options.chars(text, index - text.length, index);
      }
    } else {

      // lastTag存在且属于纯文本内容元素,如script标签、style标签或textarea标签
      let endTagLength = 0;
      const stackedTag = lastTag.toLowerCase();

      // 匹配纯文本标签的内容或结束标签
      const reStackedTag =
        reCache[stackedTag] ||
        (reCache[stackedTag] = new RegExp(
          "([\\s\\S]*?)(</" + stackedTag + "[^>]*>)",
          "i"
        ));
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length;
        // 标签非纯文本元素(script、style或textarea) 且标签名不是noscript
        if (!isPlainTextElement(stackedTag) && stackedTag !== "noscript") {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, "$1") // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1");
        }

        // 判断标签是否是pre或textarea，且第一个内容是换行符
        // |> 则删除换行符
        // |> HTML历史问题，此处作兼容性处理
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1);
        }

        // 调用options.char处理内容文本节点，如textarea标签内的内容
        if (options.chars) {
          options.chars(text);
        }
        return "";
      });

      // 移除rest部分, 并修改index索引位置
      // |> 如html 是 foo</textarea></div>时，rest 即为</div>
      index += html.length - rest.length;
      html = rest;
      
      // 解析结束标签
      parseEndTag(stackedTag, index - endTagLength, index);
    }

    // 上述无法处理的情况，
    // 即最后html与last还是相同, 将其视作文本处理
    if (html === last) {
      options.chars && options.chars(html);

      // 非生产环境、标签解析完，且warn函数存在，打印⚠️信息
      if (
        process.env.NODE_ENV !== "production" &&
        !stack.length &&
        options.warn
      ) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, {
          start: index + html.length,
        });
      }
      break;
    }
  }

  // 清除最后遗留标签
  // 如 <div></div><p>情况下stack中会遗留<p>标签元素
  parseEndTag();

  function advance(n) {
    index += n;
    html = html.substring(n);
  }

  /**
   * 匹配开始标签，并返回匹配项
   * |> 1. 匹配开始标签位置
   * |> 2. 匹配动态属性和普通属性
   * |> 3. 标记自闭合标签
   */
  function parseStartTag() {
    // 匹配标签开始，如<div
    const start = html.match(startTagOpen);
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index,
      };

      // 删除标签开始部分(如<div)，并修改index索引位置
      advance(start[0].length);

      let end, attr;

      while (

        // 匹配自闭合标签，如<img />中的/>
        // |> 匹配到则把值赋给end
        !(end = html.match(startTagClose)) &&

        // dynamicArgAttribute --> 动态属性
        // attribute --> 普通属性
        // 属性匹配到，则赋给attr,
        (attr = html.match(dynamicArgAttribute) || html.match(attribute))
      ) {

        // 整个while条件的意思
        // |> 还未匹配到结束，然后匹配到属性，则把属性加入match.attrs中
        // |> 无论是否存在自闭合标签，属性没处理完，&&前条件都是true
        // |> 匹配到自闭合标签(/>)，end有值，则退出while循环，也代表开始标签解析完
        // |> 匹配不到自闭合标签，属性也处理完，也退出while循环，也代表开始标签解析完
        attr.start = index;
        advance(attr[0].length);
        attr.end = index;
        match.attrs.push(attr);
      }

      // end存在
      // |> 存在自闭合标签，代表着这个标签到自闭合标签就解析完
      // |> 如 <img /> 到 /> 就表示img标签解析完了
      if (end) {

        // unarySlash 表示 /> 中的 /
        match.unarySlash = end[1];
        advance(end[0].length);
        match.end = index;
        return match;
      }
    }
  }

  /**
   * 处理开始标签
   * |> 1.自动补齐p标签, 即<p> -> <p></p>, 打印错误信息
   * |> 2.遍历属性列表，编码属性值，并重新赋值
   * |> 3.区分自闭合标签和非自闭合标签
   * |> 4.调用options.start解析具体属性值(如v-if处理), 并构造基本AST抽象语法树
   */
  function handleStartTag(match) {
    const tagName = match.tagName;
    const unarySlash = match.unarySlash;

    if (expectHTML) {

      // 如果当前tag是p标签，且tagName是非段落时内容
      // |> 则自动补齐p标签
      // |> 如<p><div></div></p> 则转成 <p></p><div></div><p></p>
      if (lastTag === "p" && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag);
      }
      // 当前解析的标签是可以省略结束标签的标签，如<li>, 
      // 并且与上一次解析到的开始标签相同
      // 如：
      /*
       * <p>one
       * <p>two
       */
      // |> 此时虽然会由浏览器自动补全p标签，但会打印错误信息
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName);
      }
    }

    // 校检是否是一元标签(自闭合标签) 或者匹配到了/>中的 /
    const unary = isUnaryTag(tagName) || !!unarySlash;

    const l = match.attrs.length;
    const attrs = new Array(l);
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i];
      
      // 取出属性值
      // |> 匹配组索引0位置是完整匹配项
      // |> 1位置是属性名
      // |> 2位置是=
      // |> 3位置是属性值
      const value = args[3] || args[4] || args[5] || "";

      // 判断是否需要编码
      const shouldDecodeNewlines =
        tagName === "a" && args[1] === "href"
        
            // 检测是否需要编码a[href]中的内容
            // Chrome会对a[href]的内容镜像编码   
          ? options.shouldDecodeNewlinesForHref

            // 检测是否需要编码换行符(兼容处理)
            // |> IE会在属性值内编码换行符，而其他浏览器不会
          : options.shouldDecodeNewlines;

      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines),
      };
      
      // 非生产环境表示属性开始索引与结束索引
      if (process.env.NODE_ENV !== "production" && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length;
        attrs[i].end = args.end;
      }
    }

    // 非自闭合标签，即只存在开始标签
    // |> 如<div></div> 只解析到了<div>阶段
    if (!unary) {
      stack.push({
        tag: tagName,
        lowerCasedTag: tagName.toLowerCase(),
        attrs: attrs,
        start: match.start,
        end: match.end,
      });
      lastTag = tagName;
    }

   
    if (options.start) {

       // 调用parse阶段--parseHTML函数时传的第二个参数中的start
      // 处理开始标签，解析属性值，
      options.start(tagName, attrs, unary, match.start, match.end);
    }
  }

  /**
   * 解析结束标签
   * |> 1. 检测是否缺少闭合标签，缺少并打印⚠️信息，并帮助闭合标签
   * |> 2. 处理stack栈中剩余的标签
   * |> 3. 解析 </br> 与 </p> 标签，与浏览器行为保持一致
   */
  function parseEndTag(tagName, start, end) {
    let pos, lowerCasedTagName;
    if (start == null) start = index;
    if (end == null) end = index;

    // 查找最接近的同类型开始标签
    // 从栈的结尾位置查找，匹配标签名
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase();
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break;
        }
      }
    } else {
      // 如果标签名不存在，则把pos设为0
      pos = 0;
    }

    if (pos >= 0) {

      // 关闭打开的元素，调整栈(清除栈不需要的标签)
      for (let i = stack.length - 1; i >= pos; i--) {

        // 非生产环境，且结束标签不存在， 则打印⚠️信息
        // |> pos 用来判断元素是否缺少闭合标签
        // |> 如果stack数组中存在索引大于pos的元素，则表示该元素一定是缺少闭合标签
        if (
          process.env.NODE_ENV !== "production" &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(`tag <${stack[i].tag}> has no matching end tag.`, {
            start: stack[i].start,
            end: stack[i].end,
          });
        }
        
        // 调用options.end将其闭合
        // |> 1. 正常闭合标签
        // |> 2. 处理未处理标签，将其正常闭合(虽然会打印⚠️信息，但也会正常闭合)
        if (options.end) {
          options.end(stack[i].tag, start, end);
        }
      }

      // 从栈中移除打开的元素
      stack.length = pos;
      lastTag = pos && stack[pos - 1].tag;
    } else if (lowerCasedTagName === "br") {
    
      // </br> 默认浏览器会正常解析成<br>，Vue也会将其正常解析
      if (options.start) {
        options.start(tagName, [], true, start, end);
      }
    } else if (lowerCasedTagName === "p") {
      
      // </p> 默认浏览器会正常解析成<p></p>，Vue也会将其正常解析
      if (options.start) {
        options.start(tagName, [], false, start, end);
      }
      if (options.end) {
        options.end(tagName, start, end);
      }
    }
  }
}
