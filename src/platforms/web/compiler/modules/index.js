import klass from './class'
import style from './style'
import model from './model'

/**
 * klass = {
*   staticKeys: ['staticClass'],
*   transformNode,
*   genData
 * }
 * 
 * style = {
 *  staticKeys: ['staticStyle'],
 *  transformNode,
 *  genData
 * }
 * 
 * model = {
 *  preTransformNode
 * }
 */

export default [
  klass,
  style,
  model
]
