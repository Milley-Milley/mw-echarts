/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import {forceLayout} from './forceHelper';
import {simpleLayout} from './simpleLayoutHelper';
import {circularLayout} from './circularLayoutHelper';
import {linearMap} from '../../util/number';
import * as vec2 from 'zrender/src/core/vector';
import * as zrUtil from 'zrender/src/core/util';

export default function (ecModel) {
    ecModel.eachSeriesByType('graph', function (graphSeries) {
        var coordSys = graphSeries.coordinateSystem;
        if (coordSys && coordSys.type !== 'view') {
            return;
        }
        if (graphSeries.get('layout') === 'force') {
            var preservedPoints = graphSeries.preservedPoints || {};
            var graph = graphSeries.getGraph();
            var nodeData = graph.data;
            var edgeData = graph.edgeData;
            var forceModel = graphSeries.getModel('force');
            var initLayout = forceModel.get('initLayout');
            if (graphSeries.preservedPoints) {
                nodeData.each(function (idx) {
                    var id = nodeData.getId(idx);
                    nodeData.setItemLayout(idx, preservedPoints[id] || [NaN, NaN]);
                });
            }
            else if (!initLayout || initLayout === 'none') {
                simpleLayout(graphSeries);
            }
            else if (initLayout === 'circular') {
                circularLayout(graphSeries, 'value');
            }

            var nodeDataExtent = nodeData.getDataExtent('value');
            var edgeDataExtent = edgeData.getDataExtent('value');
            // var edgeDataExtent = edgeData.getDataExtent('value');
            var repulsion = forceModel.get('repulsion');
            var edgeLength = forceModel.get('edgeLength');
            if (!zrUtil.isArray(repulsion)) {
                repulsion = [repulsion, repulsion];
            }
            if (!zrUtil.isArray(edgeLength)) {
                edgeLength = [edgeLength, edgeLength];
            }
            // Larger value has smaller length
            edgeLength = [edgeLength[1], edgeLength[0]];

            var nodes = nodeData.mapArray('value', function (value, idx) {
                var point = nodeData.getItemLayout(idx);
                var rep = linearMap(value, nodeDataExtent, repulsion);
                if (isNaN(rep)) {
                    rep = (repulsion[0] + repulsion[1]) / 2;
                }
                return {
                    w: rep,
                    rep: rep,
                    fixed: nodeData.getItemModel(idx).get('fixed'),
                    p: (!point || isNaN(point[0]) || isNaN(point[1])) ? null : point
                };
            });

            const nodeEdgeMap = {}
            edgeData.mapArray('value', function (value, idx) {
                var edge = graph.getEdgeByIndex(idx);
                var edgeModel = edge.getModel();
                var eId = edgeModel.option.id
                var nId1 = edge.node1.id
                var nId2 = edge.node2.id
                if (nodeEdgeMap[`${nId1},${nId2}`]) {
                    nodeEdgeMap[`${nId1},${nId2}`].push(eId)
                } else if (nodeEdgeMap[`${nId2},${nId1}`]) {
                    nodeEdgeMap[`${nId2},${nId1}`].push(eId)
                } else {
                    nodeEdgeMap[`${nId1},${nId2}`] = [eId]
                }
            });

            var edges = edgeData.mapArray('value', function (value, idx) {
                var edge = graph.getEdgeByIndex(idx);
                var d = linearMap(value, edgeDataExtent, edgeLength);
                if (isNaN(d)) {
                    d = (edgeLength[0] + edgeLength[1]) / 2;
                }

                var edgeModel = edge.getModel();
                var eId = edgeModel.option.id
                var nId1 = edge.node1.id
                var nId2 = edge.node2.id
                const directionK = nodeEdgeMap[`${nId1},${nId2}`] ? 1 : -1
                const eIdsBetween = directionK === 1 ? nodeEdgeMap[`${nId1},${nId2}`] : nodeEdgeMap[`${nId2},${nId1}`]
                const index = eIdsBetween.indexOf(eId)

                let curveness = 0
                if (eIdsBetween.length > 1) {
                    curveness = Math.max(1/eIdsBetween.length, .05)
                    curveness *= eIdsBetween.length % 2 ? Math.ceil(index / 2) : Math.ceil((index + 1) / 2)
                    curveness -= eIdsBetween.length % 2 ? 0 : (.5/eIdsBetween.length)
                    curveness *= (index % 2 ? 1 : -1) * directionK
                } else {
                    curveness = edgeModel.get('lineStyle.curveness') || 0
                }

                return {
                    n1: nodes[edge.node1.dataIndex],
                    n2: nodes[edge.node2.dataIndex],
                    d: d,
                    curveness,
                    ignoreForceLayout: edgeModel.get('ignoreForceLayout'),
                    angle: 2 * Math.PI / eIdsBetween.length * index + Math.PI,
                };
            });

            var coordSys = graphSeries.coordinateSystem;
            var rect = coordSys.getBoundingRect();
            var forceInstance = forceLayout(nodes, edges, {
                rect: rect,
                gravity: forceModel.get('gravity'),
                friction: forceModel.get('friction')
            });
            var oldStep = forceInstance.step;
            forceInstance.step = function (cb) {
                for (var i = 0, l = nodes.length; i < l; i++) {
                    if (nodes[i].fixed) {
                        // Write back to layout instance
                        vec2.copy(nodes[i].p, graph.getNodeByIndex(i).getLayout());
                    }
                }
                oldStep(function (nodes, edges, stopped) {
                    for (var i = 0, l = nodes.length; i < l; i++) {
                        if (!nodes[i].fixed) {
                            graph.getNodeByIndex(i).setLayout(nodes[i].p);
                        }
                        preservedPoints[nodeData.getId(i)] = nodes[i].p;
                    }
                    for (var i = 0, l = edges.length; i < l; i++) {
                        var e = edges[i];
                        var edge = graph.getEdgeByIndex(i);
                        var p1 = e.n1.p;
                        var p2 = e.n2.p;
                        var points = edge.getLayout();
                        points = points ? points.slice() : [];
                        points[0] = points[0] || [];
                        points[1] = points[1] || [];
                        vec2.copy(points[0], p1);
                        vec2.copy(points[1], p2);
                        // if source = target, draw a circle
                        if (p1[0] === p2[0] && p1[1] === p2[1]) {
                            points[2] = {
                                r: e.d, 
                                angle: e.angle
                            };
                        } 
                        // if curveness is asked
                        else if (+e.curveness) {
                            points[2] = [
                                (p1[0] + p2[0]) / 2 - (p1[1] - p2[1]) * e.curveness,
                                (p1[1] + p2[1]) / 2 - (p2[0] - p1[0]) * e.curveness
                            ];
                        }
                        edge.setLayout(points);
                    }
                    // Update layout

                    cb && cb(stopped);
                });
            };
            graphSeries.forceLayout = forceInstance;
            graphSeries.preservedPoints = preservedPoints;

            // Step to get the layout
            forceInstance.step();
        }
        else {
            // Remove prev injected forceLayout instance
            graphSeries.forceLayout = null;
        }
    });
}
