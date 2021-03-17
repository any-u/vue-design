/* @flow */

/**
 * Expand input[v-model] with dynamic type bindings into v-if-else chains
 * Turn this:
 *   <input v-model="data[type]" :type="type">
 * into this:
 *   <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
 *   <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
 *   <input v-else :type="type" v-model="data[type]">
 */

import {
  addRawAttr,
  getBindingAttr,
  getAndRemoveAttr
} from 'compiler/helpers'

import {
  processFor,
  processElement,
  addIfCondition,
  createASTElement
} from 'compiler/parser/index'


/**
 * 处理使用了v-model属性并且使用了绑定的type属性的input标签
 * |> 当前只有这个处理，后续可能会补充其他预处理
 */
function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') {

    const map = el.attrsMap
    if (!map['v-model']) {
      return
    }

    let typeBinding

    // 如果绑定了type属性
    // |> <input v-model="val" :type="inputType" >
    // |> 或 <input v-model="val" v-bind:type="inputType" >
    if (map[':type'] || map['v-bind:type']) {

      // 获取绑定type的属性值,此处即inputType
      typeBinding = getBindingAttr(el, 'type')
    }

    // 通过以下方案绑定type
    // |> <input v-model="val" v-bind="{ type: inputType }" />
    if (!map.type && !typeBinding && map['v-bind']) {

      // 获取绑定type的属性值,此处即inputType
      typeBinding = `(${map['v-bind']}).type`
    }

    if (typeBinding) {
      
      // 获取el.attrsMap上v-if的结果
      // |> 第三个参数设为true，即取完，则会删除el.attrsMap上v-if的值
      // |> 如果 <input v-model="val" :type="inputType" v-if="display" />
      // |> ifCondition 即为 display
      const ifCondition = getAndRemoveAttr(el, 'v-if', true)

      // |> ifConditionExtra 即为 &&(display)
      const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : ``

      // 判断el.attrsMap上是否存在v-else
      const hasElse = getAndRemoveAttr(el, 'v-else', true) != null

      // 获取el.attrsMap上v-else-if的结果
      // |> 第三个参数设为true，即取完，则会删除el.attrsMap上v-else-if的值
      const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true)
      

      // |> 类型checkbox与类型radio的input标签的行为是不一样的
      // |> 所以当用了v-model属性且使用了绑定的type属性
      // |>  采用v-if  type === checkbox ，渲染checkbox节点
      // |>v-else-if  type === radio, 渲染radio节点
      // |>   v-else  渲染其他节点

      // 1. 处理checkbox的情况
      // 克隆当前AST元素
      const branch0 = cloneASTElement(el)
      // 在主节点上处理

      // 处理v-for属性
      processFor(branch0)
      // 添加原始属性type --> checkbox
      addRawAttr(branch0, 'type', 'checkbox')
      // 处理元素
      processElement(branch0, options)
      // 将processed设为true，防止二次处理
      branch0.processed = true 
      // 添加if属性，并将checkbox渲染结果添加到branchO上的ifConditions
      branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
      addIfCondition(branch0, {
        exp: branch0.if,
        block: branch0
      })

      // 2. 新增radio(v-else)
      // |> 把radio渲染结果添加branch0上的ifConditions
      const branch1 = cloneASTElement(el)
      getAndRemoveAttr(branch1, 'v-for', true)
      addRawAttr(branch1, 'type', 'radio')
      processElement(branch1, options)
      addIfCondition(branch0, {
        exp: `(${typeBinding})==='radio'` + ifConditionExtra,
        block: branch1
      })

      // 3. input其他情况
      // |> 把input其他情况渲染结果添加到branch0上的ifConditions
      const branch2 = cloneASTElement(el)
      getAndRemoveAttr(branch2, 'v-for', true)
      addRawAttr(branch2, ':type', typeBinding)
      processElement(branch2, options)
      addIfCondition(branch0, {
        exp: ifCondition,
        block: branch2
      })

      // 如果input存在v-else，则把branch0节点上else属性设为true
      if (hasElse) {
        branch0.else = true

        // input存在v-else-if，则把branch0节点上elseif属性设为true
      } else if (elseIfCondition) {
        branch0.elseif = elseIfCondition
      }

      // 返回branch0节点
      return branch0
    }
  }
}

function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}

export default {
  preTransformNode
}
