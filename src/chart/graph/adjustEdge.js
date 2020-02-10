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

import * as curveTool from 'zrender/src/core/curve';
import * as vec2 from 'zrender/src/core/vector';
import {getSymbolSize} from './graphHelper';

var v1 = [];
var v2 = [];
var v3 = [];
var quadraticAt = curveTool.quadraticAt;
var v2DistSquare = vec2.distSquare;
var mathAbs = Math.abs;
function intersectCurveCircle(curvePoints, center, radius) {
    var p0 = curvePoints[0];
    var p1 = curvePoints[1];
    var p2 = curvePoints[2];

    var d = Infinity;
    var t;
    var radiusSquare = radius * radius;
    var interval = 0.1;

    for (var _t = 0.1; _t <= 0.9; _t += 0.1) {
        v1[0] = quadraticAt(p0[0], p1[0], p2[0], _t);
        v1[1] = quadraticAt(p0[1], p1[1], p2[1], _t);
        var diff = mathAbs(v2DistSquare(v1, center) - radiusSquare);
        if (diff < d) {
            d = diff;
            t = _t;
        }
    }

    // Assume the segment is monotone，Find root through Bisection method
    // At most 32 iteration
    for (var i = 0; i < 32; i++) {
        // var prev = t - interval;
        var next = t + interval;
        // v1[0] = quadraticAt(p0[0], p1[0], p2[0], prev);
        // v1[1] = quadraticAt(p0[1], p1[1], p2[1], prev);
        v2[0] = quadraticAt(p0[0], p1[0], p2[0], t);
        v2[1] = quadraticAt(p0[1], p1[1], p2[1], t);
        v3[0] = quadraticAt(p0[0], p1[0], p2[0], next);
        v3[1] = quadraticAt(p0[1], p1[1], p2[1], next);

        var diff = v2DistSquare(v2, center) - radiusSquare;
        if (mathAbs(diff) < 1e-2) {
            break;
        }

        // var prevDiff = v2DistSquare(v1, center) - radiusSquare;
        var nextDiff = v2DistSquare(v3, center) - radiusSquare;

        interval /= 2;
        if (diff < 0) {
            if (nextDiff >= 0) {
                t = t + interval;
            }
            else {
                t = t - interval;
            }
        }
        else {
            if (nextDiff >= 0) {
                t = t - interval;
            }
            else {
                t = t + interval;
            }
        }
    }

    return t;
}

// Adjust edge to avoid
export default function (graph, scale) {
    var tmp0 = [];
    var quadraticSubdivide = curveTool.quadraticSubdivide;
    var pts = [[], [], []];
    var pts2 = [[], []];
    var v = [];
    scale /= 2;

    graph.eachEdge(function (edge, idx) {
        var linePoints = edge.getLayout();
        var fromSymbol = edge.getVisual('fromSymbol');
        var toSymbol = edge.getVisual('toSymbol');

        var isCircleEdge = false

        if (linePoints[2] != null) {
            // x, y for circle center
            const [x0, y0] = linePoints[0]
            if (x0 === linePoints[1][0] && y0 === linePoints[1][1]) {
                isCircleEdge = true
                // random deviation angle
                // so if there are multiple source = target links of one node, they will not cover each other
                const angle = linePoints[2].angle
                const diffAngle = Math.PI / 4 // 45 degree
                const symbolSize = getSymbolSize(edge.node1)
                const diffLength = symbolSize * scale
                // const circleEdgeLength = linePoints[2].r * symbolSize / 40
                linePoints[0] = [x0 + diffLength * Math.cos(angle + diffAngle), y0 + diffLength * Math.sin(angle + diffAngle)];
                linePoints[1] = [x0 + diffLength * Math.cos(angle - diffAngle), y0 + diffLength * Math.sin(angle - diffAngle)];
                // linePoints[2] = [x0 + circleEdgeLength * Math.cos(angle), y0 + circleEdgeLength * Math.sin(angle)]

                const [ sx, sy ] = linePoints[0]
                const [ ex, ey ] = linePoints[1]
                const cx = (sx + ex) / 2
                const cy = (sy + ey) / 2
                const diff = Math.sqrt((ex - sx)*(ex - sx) + (ey - sy)*(ey - sy))

                const sinA = (ex - sx) / diff
                const cosA = (ey - sy) / diff
                const xk = 2.5
                const yk = 4
                const cx2 = cx - yk * diff * cosA
                const cy2 = cy + yk * diff * sinA

                const p1_x = cx2 - xk * diff * sinA, p1_y = cy2 - xk * diff * cosA
                const p2_x = cx2 + xk * diff * sinA, p2_y = cy2 + xk * diff * cosA
                linePoints[2] = [ p1_x, p1_y ]
                linePoints[3] = [ p2_x, p2_y ]

            }
        }

        if (!linePoints.__original) {
            linePoints.__original = [
                vec2.clone(linePoints[0]),
                vec2.clone(linePoints[1])
            ];
            if (linePoints[2]) {
                linePoints.__original.push(vec2.clone(linePoints[2]));
            }
        }
        var originalPoints = linePoints.__original;
        // Quadratic curve
        if (linePoints[2] != null) {
            vec2.copy(pts[0], originalPoints[0]);
            vec2.copy(pts[1], originalPoints[2]);
            vec2.copy(pts[2], originalPoints[1]);
            if (fromSymbol && fromSymbol !== 'none' && !isCircleEdge) {
                var symbolSize = getSymbolSize(edge.node1);

                var t = intersectCurveCircle(pts, originalPoints[0], symbolSize * scale);
                // Subdivide and get the second
                quadraticSubdivide(pts[0][0], pts[1][0], pts[2][0], t, tmp0);
                pts[0][0] = tmp0[3];
                pts[1][0] = tmp0[4];
                quadraticSubdivide(pts[0][1], pts[1][1], pts[2][1], t, tmp0);
                pts[0][1] = tmp0[3];
                pts[1][1] = tmp0[4];
            }
            if (toSymbol && toSymbol !== 'none' && !isCircleEdge) {
                var symbolSize = getSymbolSize(edge.node2);

                var t = intersectCurveCircle(pts, originalPoints[1], symbolSize * scale);
                // Subdivide and get the first
                quadraticSubdivide(pts[0][0], pts[1][0], pts[2][0], t, tmp0);
                pts[1][0] = tmp0[1];
                pts[2][0] = tmp0[2];
                quadraticSubdivide(pts[0][1], pts[1][1], pts[2][1], t, tmp0);
                pts[1][1] = tmp0[1];
                pts[2][1] = tmp0[2];
            }
            // Copy back to layout
            vec2.copy(linePoints[0], pts[0]);
            vec2.copy(linePoints[1], pts[2]);
            vec2.copy(linePoints[2], pts[1]);
        }
        // Line
        else {
            vec2.copy(pts2[0], originalPoints[0]);
            vec2.copy(pts2[1], originalPoints[1]);

            vec2.sub(v, pts2[1], pts2[0]);
            vec2.normalize(v, v);
            if (fromSymbol && fromSymbol !== 'none') {

                var symbolSize = getSymbolSize(edge.node1);

                vec2.scaleAndAdd(pts2[0], pts2[0], v, symbolSize * scale);
            }
            if (toSymbol && toSymbol !== 'none') {
                var symbolSize = getSymbolSize(edge.node2);

                vec2.scaleAndAdd(pts2[1], pts2[1], v, -symbolSize * scale);
            }
            vec2.copy(linePoints[0], pts2[0]);
            vec2.copy(linePoints[1], pts2[1]);
        }
    });
}