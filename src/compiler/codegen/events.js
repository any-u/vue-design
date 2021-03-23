/* @flow */

const fnExpRE = /^([\w$_]+|\([^)]*?\))\s*=>|^function(?:\s+[\w$]+)?\s*\(/
const fnInvokeRE = /\([^)]*?\);*$/
const simplePathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/

// KeyboardEvent.keyCode aliases
const keyCodes: { [key: string]: number | Array<number> } = {
  esc: 27,
  tab: 9,
  enter: 13,
  space: 32,
  up: 38,
  left: 37,
  right: 39,
  down: 40,
  'delete': [8, 46]
}

// KeyboardEvent.key aliases
const keyNames: { [key: string]: string | Array<string> } = {
  // #7880: IE11 and Edge use `Esc` for Escape key name.
  esc: ['Esc', 'Escape'],
  tab: 'Tab',
  enter: 'Enter',
  // #9112: IE11 uses `Spacebar` for Space key name.
  space: [' ', 'Spacebar'],
  // #7806: IE11 uses key names without `Arrow` prefix for arrow keys.
  up: ['Up', 'ArrowUp'],
  left: ['Left', 'ArrowLeft'],
  right: ['Right', 'ArrowRight'],
  down: ['Down', 'ArrowDown'],
  // #9112: IE11 uses `Del` for Delete key name.
  'delete': ['Backspace', 'Delete', 'Del']
}

// #4868: modifiers that prevent the execution of the listener
// need to explicitly return null so that we can determine whether to remove
// the listener for .once
const genGuard = condition => `if(${condition})return null;`

const modifierCode: { [key: string]: string } = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard(`$event.target !== $event.currentTarget`),
  ctrl: genGuard(`!$event.ctrlKey`),
  shift: genGuard(`!$event.shiftKey`),
  alt: genGuard(`!$event.altKey`),
  meta: genGuard(`!$event.metaKey`),
  left: genGuard(`'button' in $event && $event.button !== 0`),
  middle: genGuard(`'button' in $event && $event.button !== 1`),
  right: genGuard(`'button' in $event && $event.button !== 2`)
}

/**
 * 事件events代码生成函数
 * |> 遍历events事件，根据动态和静态添加到对应的处理器数组中
 */
export function genHandlers (
  events: ASTElementHandlers,
  isNative: boolean
): string {
  // isNative -> 是否原生事件
  const prefix = isNative ? 'nativeOn:' : 'on:'
  let staticHandlers = ``
  let dynamicHandlers = ``

  // 遍历事件events
  // 分别处理静态处理器和动态处理器
  for (const name in events) {
    // 生成事件处理代码
    const handlerCode = genHandler(events[name])

    // 将事件处理代码添加到对应的处理器数组中
    // |> dynamicHandlers -> 动态处理器数组
    // |> staticHandlers -> 静态处理器数组
    if (events[name] && events[name].dynamic) {
      dynamicHandlers += `${name},${handlerCode},`
    } else {
      staticHandlers += `"${name}":${handlerCode},`
    }
  }
  // 静态处理器删除最后符号，用于下方在后面添加"])"
  staticHandlers = `{${staticHandlers.slice(0, -1)}}`

  // 分动态和静态情况，添加前缀代码
  if (dynamicHandlers) {
    return prefix + `_d(${staticHandlers},[${dynamicHandlers.slice(0, -1)}])`
  } else {
    return prefix + staticHandlers
  }
}

// Generate handler code with binding params on Weex
/* istanbul ignore next */
function genWeexHandler (params: Array<any>, handlerCode: string) {
  let innerHandlerCode = handlerCode
  const exps = params.filter(exp => simplePathRE.test(exp) && exp !== '$event')
  const bindings = exps.map(exp => ({ '@binding': exp }))
  const args = exps.map((exp, i) => {
    const key = `$_${i + 1}`
    innerHandlerCode = innerHandlerCode.replace(exp, key)
    return key
  })
  args.push('$event')
  return '{\n' +
    `handler:function(${args.join(',')}){${innerHandlerCode}},\n` +
    `params:${JSON.stringify(bindings)}\n` +
    '}'
}

/**
 * 单个event事件代码生成工具
 * |> 1.方法名事件，如@click="doSomething"中的doSomething
 * |> 2.函数表达式事件，如@click="() => {}" or @click="function(){}"
 * |> 3.函数调用事件，如@click="doSomething($event)"
 */
function genHandler (handler: ASTElementHandler | Array<ASTElementHandler>): string {
  if (!handler) {
    return 'function(){}'
  }

  if (Array.isArray(handler)) {
    return `[${handler.map(handler => genHandler(handler)).join(',')}]`
  }

  // 校检是否是方法名
  // 如 @click="doSomething"中的doSomething
  const isMethodPath = simplePathRE.test(handler.value)

  // 校检是否是函数表达式
  // 如 @click="() => {}" or @click="function(){}"
  const isFunctionExpression = fnExpRE.test(handler.value)

  // 校检是否是函数调用
  // @click="doSomething($event)"
  const isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, ''))

  // 没有使用修饰符
  if (!handler.modifiers) {
    // 如果是方法名，或函数调用，直接返回
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      return genWeexHandler(handler.params, handler.value)
    }
    return `function($event){${
      isFunctionInvocation ? `return ${handler.value}` : handler.value
    }}` // inline statement
  } else {
    // 使用修饰符

    let code = ''
    let genModifierCode = ''
    const keys = []
    for (const key in handler.modifiers) {
      // 修饰符存在
      if (modifierCode[key]) {

        // 拼接内部的事件修饰符
        genModifierCode += modifierCode[key]

        // left/right两个修饰符
        // |> 普通right事件会被修改为contextmenu事件，
        // |> 动态right事件会走到此处,即v-on:[foo].right="handleRight"
        if (keyCodes[key]) {
          keys.push(key)
        }
      } else if (key === 'exact') {
        // 检验key是否是exact
        // |> 校检系统修饰符组合处理
        const modifiers: ASTModifiers = (handler.modifiers: any)
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(keyModifier => !modifiers[keyModifier])
            .map(keyModifier => `$event.${keyModifier}Key`)
            .join('||')
        )
      } else {
        // 其他修饰符
        keys.push(key)
      }
    }

    // 拼接自定义修饰符
    if (keys.length) {
      code += genKeyFilter(keys)
    }

    // 确保prevent和stop修饰符在按键过滤之后执行
    if (genModifierCode) {
      code += genModifierCode
    }

    // 事件回调主体
    const handlerCode = isMethodPath
      ? `return ${handler.value}.apply(null, arguments)`
      : isFunctionExpression
        ? `return (${handler.value}).apply(null, arguments)`
        : isFunctionInvocation
          ? `return ${handler.value}`
          : handler.value
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      return genWeexHandler(handler.params, code + handlerCode)
    }
    return `function($event){${code}${handlerCode}}`
  }
}

function genKeyFilter (keys: Array<string>): string {
  return (
    // 确保键过滤器仅适用于keyboard事件
    // |> 不能在$event中使用"keyCode"
    // |> 因为Chrome自动填充会触发不具有keyCode属性的伪造按键事件
    `if(!$event.type.indexOf('key')&&` +
    `${keys.map(genFilterCode).join('&&')})return null;`
  )
}

function genFilterCode (key: string): string {
  const keyVal = parseInt(key, 10)
  if (keyVal) {
    return `$event.keyCode!==${keyVal}`
  }
  const keyCode = keyCodes[key]
  const keyName = keyNames[key]
  return (
    `_k($event.keyCode,` +
    `${JSON.stringify(key)},` +
    `${JSON.stringify(keyCode)},` +
    `$event.key,` +
    `${JSON.stringify(keyName)}` +
    `)`
  )
}
