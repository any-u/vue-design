/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * 创建资源注册函数
   */
  // ASSET_TYPES = ['component', 'directive', 'filter']
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      // 未设置definition，则表示获取，从this.options中的[type + 's']里获取
      if (!definition) {
        return this.options[type + 's'][id]
      } else {

        // 非生产环境校检组件name
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }

        // type为component，且definition为普通对象, 则调用this.options._base.extend(即Vue.extend)处理definition
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id
          definition = this.options._base.extend(definition)
        }

        // type 为 directive 且 definition为函数，则重新设置definition对象
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }

        // 给this.options上的资源设置id-definition的映射
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
