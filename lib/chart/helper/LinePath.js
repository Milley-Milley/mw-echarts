
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

var graphic = require("../../util/graphic");

var vec2 = require("zrender/lib/core/vector");

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

/**
 * Line path for bezier and straight line draw
 */
var straightLineProto = graphic.Line.prototype;
var bezierCurveProto = graphic.BezierCurve.prototype;

function isLine(shape) {
  return isNaN(+shape.cpx1) || isNaN(+shape.cpy1);
}

function _cubicDerivativeAt(p0, p1, p2, p3, t) {
  var onet = 1 - t;
  return 3 * (((p1 - p0) * onet + 2 * (p2 - p1) * t) * onet + (p3 - p2) * t * t);
}

var _default = graphic.extendShape({
  type: 'ec-line',
  style: {
    stroke: '#000',
    fill: null
  },
  shape: {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    percent: 1,
    cpx1: null,
    cpy1: null
  },
  buildPath: function (ctx, shape) {
    this[isLine(shape) ? '_buildPathLine' : '_buildPathCurve'](ctx, shape);
  },
  _buildPathLine: straightLineProto.buildPath,
  _buildPathCurve: bezierCurveProto.buildPath,
  pointAt: function (t) {
    return this[isLine(this.shape) ? '_pointAtLine' : '_pointAtCurve'](t);
  },
  _pointAtLine: straightLineProto.pointAt,
  _pointAtCurve: bezierCurveProto.pointAt,
  tangentAt: function (t) {
    var shape = this.shape;
    var p = isLine(shape) ? [shape.x2 - shape.x1, shape.y2 - shape.y1] : this._tangentAtCurve(shape, t);
    return vec2.normalize(p, p);
  },
  // _tangentAtCurve: bezierCurveProto.tangentAt
  _tangentAtCurve: function (shape, t) {
    var cpx2 = shape.cpx2;
    var cpy2 = shape.cpy2;

    if (!isNaN(cpx2) && !isNaN(cpy2)) {
      return [_cubicDerivativeAt(shape.x1, shape.cpx1, shape.cpx2, shape.x2, t), _cubicDerivativeAt(shape.y1, shape.cpy1, shape.cpy2, shape.y2, t)];
    }

    return bezierCurveProto.tangentAt.call(this, t);
  }
});

module.exports = _default;