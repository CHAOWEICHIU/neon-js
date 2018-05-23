import axios from 'axios'
import Protocol from './Protocol'
import fs from 'fs'
import logger from '../logging'
import { queryRPC } from './query'

const latencyCheck = (axiosCalls, maxLatency) => {
  return new Promise((resolve, reject) => {
    let rpcs = []
    axiosCalls.forEach(axiosCall => {
      axiosCall.then(res => {
        rpcs.push(res)
      }).catch(() => '')
    })
    setTimeout(resolve, maxLatency, rpcs)
  })
}

const selectHighestResult = (rpcs) => {
  return rpcs.sort((a, b) => b.result - a.result)[0]
}

const log = logger('protocol')

/**
 * Network interface representing a NEO blockchain network.
 * @param {NetworkLike} config - NetworkLike JS object
 */
export default class Network {
  constructor (config = {}, name = null) {
    this.name = config.Name || config.name || name || 'RandomNet'
    if (name) this.name = name
    let protocolLike = config.protocol || config.ProtocolConfiguration || {}
    this.protocol = new Protocol(protocolLike)
    this.nodes = config.Nodes || config.nodes || []
    this.extra = config.ExtraConfiguration || config.extra || {}
  }

  /**
   * Imports a json object or string. Overrides the network name with the given name if provided.
   * @param {object|string} jsonLike
   * @param {string} [name]
   * @return {Network}
   */
  static import (jsonLike, name = null) {
    const jsonObj = typeof (jsonString) === 'string' ? JSON.parse(jsonLike) : jsonLike
    return new Network(jsonObj, name)
  }

  /**
   * Reads a Network file and imports it.
   * @param {string} filePath
   * @param {string} [name]
   * @returns {Network}
   */
  static readFile (filePath, name = null) {
    log.info(`Importing Network file from ${filePath}`)
    return this.import(fs.readFileSync(filePath, 'utf8'), name)
  }

  /**
   * Exports the class as a JSON string. Set protocolOnly to export only the protocol.
   * @param {boolean} [protocolOnly] - Exports only the protocol (usable by NEO node) Defaults to false.
   * @returns {NetworkLike}
   */
  export (protocolOnly = false) {
    if (protocolOnly) {
      return JSON.stringify({
        ProtocolConfiguration: this.protocol.export()
      })
    }
    return {
      Name: this.name,
      ProtocolConfiguration: this.protocol.export(),
      ExtraConfiguration: this.extra,
      Nodes: this.nodes
    }
  }

  getBestRPCEndpoint ({ maxLatency = 4000 }) {
    const fetchingRpcList = () => {
      const mainNetJsonEndpoint = 'https://raw.githubusercontent.com/CityOfZion/neo-mon/master/docs/assets/mainnet.json'
      const testNetJsonEndpoint = 'https://raw.githubusercontent.com/CityOfZion/neo-mon/master/docs/assets/testnet.json'
      return new Promise((resolve) => {
        if (this.extra.rpcs) {
          resolve(this.extra.rpcs)
        }
        axios
          .get(this.name === 'TestNet' ? mainNetJsonEndpoint : testNetJsonEndpoint)
          .then(response => response.data.sites.filter(r => r.type === 'RPC'))
          .then(rpcs => rpcs.map(rpc => rpc.protocol + '://' + rpc.url))
          .then(urls => resolve(urls))
      })
    }
    return fetchingRpcList()
      .then(urls => urls.map(url => queryRPC(url, { id: url })))
      .then(rpcs => latencyCheck(rpcs, maxLatency))
      .then(rpcs => selectHighestResult(rpcs))
      .then(bestRpc => bestRpc ? bestRpc.id : null)
  }

  /**
   * Writes the class to file. This is a synchronous operation.
   * @param {string} filepath The filepath to write the Network to.
   * @param {boolean} [protocolOnly] - exports only the protocol (usable by NEO node). Defaults to false.
   * @returns {boolean}
   */
  writeFile (filepath, protocolOnly = false) {
    return fs.writeFile(filepath, this.export(protocolOnly), (err) => {
      if (err) throw err
      log.info('Network file written!')
      return true
    })
  }

  /**
   * Updates the nodes in the current list by pinging them for block height.
   * @return {Network} this
   */
  update () {
    return this
  }
}
