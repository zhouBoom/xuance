// @ts-nocheck
// 用户平台的用户信息默认配置
var getProto = Object.getPrototypeOf,

    class2type = {},

    toString = class2type.toString,

    hasOwn = class2type.hasOwnProperty,

    fnToString = hasOwn.toString,

    ObjectFunctionString = fnToString.call(Object),

    isFunction = function isFunction(obj) {
        return typeof obj === "function" && typeof obj.nodeType !== "number";
    };

// 命名对外的函数名称
var COPY = function () {};
COPY.fn = COPY.prototype = {};

COPY.extend = COPY.fn.extend = function () {
    var options, name, src, copy, copyIsArray, clone,
        target = arguments[0] || {},
        i = 1,
        length = arguments.length,
        deep = false;
    // Handle a deep copy situation
    if (typeof target === "boolean") {
        deep = target;

        // Skip the boolean and the target
        target = arguments[i] || {};
        i++;
    }

    // Handle case when target is a string or something (possible in deep copy)
    if (typeof target !== "object" && !isFunction(target)) {
        target = {};
    }

    // Extend UP itself if only one argument is passed
    if (i === length) {
        target = this;
        i--;
    }

    for (; i < length; i++) {

        // Only deal with non-null/undefined values
        if ((options = arguments[i]) !== null) {

            // Extend the base object
            for (name in options) {
                copy = options[name];

                // Prevent Object.prototype pollution
                // Prevent never-ending loop
                if (name === "__proto__" || target === copy) {
                    continue;
                }

                // Recurse if we're merging plain objects or arrays
                if (deep && copy && (COPY.isPlainObject(copy) ||
                    (copyIsArray = Array.isArray(copy)))) {
                    src = target[name];

                    // Ensure proper type for the source value
                    if (copyIsArray && !Array.isArray(src)) {
                        clone = [];
                    } else if (!copyIsArray && !COPY.isPlainObject(src)) {
                        clone = {};
                    } else {
                        clone = src;
                    }
                    copyIsArray = false;

                    // Never move original objects, clone them
                    target[name] = COPY.extend(deep, clone, copy);

                    // Don't bring in undefined values
                } else if (copy !== undefined) {
                    target[name] = copy;
                }
            }
        }
    }

    // Return the modified object
    return target;
}

COPY.extend({
    isPlainObject: function (obj) {
        var proto, Ctor;

        // Detect obvious negatives
        // Use toString instead of UP.type to catch host objects
        // 代码排除掉undefined null function number string boolean window document
        if (!obj || toString.call(obj) !== "[object Object]") {
            return false;
        }

        proto = getProto(obj);

        // Objects with no prototype (e.g., `Object.create( null )`) are plain
        // 对象的原型
        if (!proto) {
            return true;
        }

        // Objects with prototype are plain iff they were constructed by a global Object function
        Ctor = hasOwn.call(proto, "constructor") && proto.constructor;
        return typeof Ctor === "function" && fnToString.call(Ctor) === ObjectFunctionString;
    },
    error: function (msg) {
        throw new Error(msg);
    }
})

export default COPY;