
browserInterop = new (function () {

    // Returns a function, that, as long as it continues to be invoked, will not
    // be triggered. The function will be called after it stops being called for
    // N milliseconds. If `immediate` is passed, trigger the function on the
    // leading edge, instead of the trailing.
    this.debounce = function (func, wait, immediate, triggerPermanent) {
        var timeout;
        return function () {
            var context = this, args = arguments;
            var later = function () {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;

            if (!triggerPermanent || !timeout) {
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            }
            if (callNow) func.apply(context, args);
        };
    };


    var jsObjectRefs = {};
    var jsObjectRefId = 0;
    var me = this;

    const jsRefKey = '__jsObjectRefId'; // Keep in sync with ElementRef.cs

    //reviver will help me store js object ref on .net like the .net do with elementreference or dotnetobjectreference
    this.jsObjectRefRevive = function (key, value) {
        if (value &&
            typeof value === 'object' &&
            value.hasOwnProperty(jsRefKey) &&
            typeof value[jsRefKey] === 'number') {

            var id = value[jsRefKey];
            if (!(id in jsObjectRefs)) {
                throw new Error("This JS object reference does not exists : " + id);
            }
            return jsObjectRefs[id];
        } else {
            return value;
        }
    };
    //this simple method will be used for getting the content of a given js object ref because js interop will call the reviver with the given C# js object ref
    this.returnInstance = function (instance, serializationSpec) {
        return me.getSerializableObject(instance, [], serializationSpec);
    }
    DotNet.attachReviver(this.jsObjectRefRevive);
    //this reviver change a given parameter to a method, it's usefull for sending .net callback to js
    DotNet.attachReviver(function (key, value) {
        if (value &&
            typeof value === 'object' &&
            value.hasOwnProperty("__isCallBackWrapper")) {


            var netObjectRef = value.callbackRef;

            var callback =  async function (...args) {
              
                if (value.getArgumentsSerializationAndRef) {
                    var passedArgs = args.map(arg => {
                        return {
                            Reference: me.storeObjectRef(arg),
                            Data: me.getSerializableObject(arg, [], value.serializationSpec, value.includeDefaults)
                        }
                    });
                    try {
                        var result = await netObjectRef.invokeMethodAsync('Invoke', ...passedArgs);
                        return result;
                    }
                    finally {
                        passedArgs.forEach(arg => me.removeObjectRef(arg.Reference));
                    }
                }
                else {
                    var passedArgs = [];
                    if (!value.getJsObjectRef) {
                        for (let index = 0; index < arguments.length; index++) {
                            const element = arguments[index];
                            passedArgs.push(me.getSerializableObject(element, [], value.serializationSpec, value.includeDefaults));
                        }
                    } else {
                        for (let index = 0; index < arguments.length; index++) {
                            const element = arguments[index];
                            passedArgs.push(me.storeObjectRef(element));
                        }
                    }

                    var result = await netObjectRef.invokeMethodAsync('Invoke', ...passedArgs);
                    return result;

                }
            };

            if (value.debounce != undefined) {
                return me.debounce(callback, value.debounce, value.immediate, value.triggerPermanent);
            }
            else {
                return callback;
            }

        } else {
            return value;
        }
    });
    var eventListenersIdCurrent = 0;
    var eventListeners = {};
    this.addEventListener = function (instance, propertyPath, eventName, callback) {
        var target = me.getInstanceProperty(instance, propertyPath);
        target.addEventListener(eventName, callback);
        var eventId = eventListenersIdCurrent++;
        eventListeners[eventId] = callback;
        return eventId;
    };
    this.removeEventListener = function (instance, propertyPath, eventName, eventListenersId) {
        var target = me.getInstanceProperty(instance, propertyPath);
        target.removeEventListener(eventName, eventListeners[eventListenersId]);
        delete eventListeners[eventListenersId];
    };
    this.getProperty = function (propertyPath) {
        return me.getInstanceProperty(window, propertyPath);
    };
    this.hasProperty = function (instance, propertyPath) {
        return me.getInstanceProperty(instance, propertyPath) !== null;
    };
    this.getPropertyRef = function (propertyPath) {
        return me.getInstancePropertyRef(window, propertyPath);
    };
    this.getInstancePropertyRef = function (instance, propertyPath) {
        return me.storeObjectRef(me.getInstanceProperty(instance, propertyPath));
    };
    this.storeObjectRef = function (obj) {
        var id = jsObjectRefId++;
        jsObjectRefs[id] = obj;
        var jsRef = {};
        jsRef[jsRefKey] = id;
        return jsRef;
    }
    this.removeObjectRef = function (id) {
        delete jsObjectRefs[id];
    }
    function getPropertyList(path) {
        var res = path.replace('[', '.').replace(']', '').split('.');
        if (res[0] === "") { // if we pass "[0].id" we want to return [0,'id']
            res.shift();
        }
        return res;
    }
    this.getInstanceProperty = function (instance, propertyPath) {
        if (propertyPath === '') {
            return instance;
        }
        var currentProperty = instance;
        var splitProperty = getPropertyList(propertyPath);

        for (i = 0; i < splitProperty.length; i++) {
            if (splitProperty[i] in currentProperty) {
                currentProperty = currentProperty[splitProperty[i]];
            } else {
                return null;
            }
        }
        return currentProperty;
    };
    this.setInstanceProperty = function (instance, propertyPath, value) {
        var currentProperty = instance;
        var splitProperty = getPropertyList(propertyPath);
        for (i = 0; i < splitProperty.length; i++) {
            if (splitProperty[i] in currentProperty) {
                if (i === splitProperty.length - 1) {
                    currentProperty[splitProperty[i]] = value;
                    return;
                } else {
                    currentProperty = currentProperty[splitProperty[i]];
                }
            } else {
                return;
            }
        }
    };
    this.getInstancePropertySerializable = function (instance, propertyName, serializationSpec) {
        var data = me.getInstanceProperty(instance, propertyName);
        if (data instanceof Promise) {//needed when some properties like beforeinstallevent.userChoice are promise
            return data;
        }
        var res = me.getSerializableObject(data, [], serializationSpec);
        return res;
    };
    this.callInstanceAction = function (instance, methodPath, ...args) {
        this.callInstanceMethod(instance, methodPath, ...args);
    }
    this.callInstanceMethod = function (instance, methodPath, ...args) {
        if (methodPath.indexOf('.') >= 0) {
            //if it's a method call on a child object we get this child object so the method call will happen in the context of the child object
            //some method like window.locaStorage.setItem  will throw an exception if the context is not expected
            var instancePath = methodPath.substring(0, methodPath.lastIndexOf('.'));
            instance = me.getInstanceProperty(instance, instancePath);
            methodPath = methodPath.substring(methodPath.lastIndexOf('.') + 1);
        }
        for (let index = 0; index < args.length; index++) {
            const element = args[index];
            //we change null value to undefined as there is no way to pass undefined value from C# and most of the browser API use undefined instead of null value for "no value"
            if (element === null) {
                args[index] = undefined;
            }
        }
        var method = me.getInstanceProperty(instance, methodPath);
        return method.apply(instance, args);
    };
    this.callInstanceMethodGetRef = function (instance, methodPath, ...args) {
        return this.storeObjectRef(this.callInstanceMethod(instance, methodPath, ...args));
    };
    this.callInstanceMethodGetRefs = function (instance, methodPath, ...args) {

        var objects = this.callInstanceMethod(instance, methodPath, ...args);
        var references = objects.map(arg => me.storeObjectRef(arg));
        return references;
    };

    this.getSerializableObject = function (data, alreadySerialized, serializationSpec, includeDefaults) {
        if (serializationSpec === false) {
            return undefined;
        }
        if (!alreadySerialized) {
            alreadySerialized = [];
        }
        if (typeof data == "undefined" ||
            data === null) {
            return null;
        }
        if (typeof data === "number" ||
            typeof data === "string" ||
            typeof data == "boolean") {
            return data;
        }
        var res = (Array.isArray(data)) ? [] : {};
        if (!serializationSpec) {
            serializationSpec = "*";
        }
        for (var i in data) {
            var currentMember = data[i];

            if (typeof currentMember === 'function' || currentMember === null) {
                continue;
            }
            var currentMemberSpec;
            if (serializationSpec != "*") {
                currentMemberSpec = Array.isArray(data) ? serializationSpec : serializationSpec[i];
                if ((!includeDefaults && !currentMemberSpec) || (currentMemberSpec === undefined)) {
                    continue;
                }
            } else {
                currentMemberSpec = "*"
            }
            if (typeof currentMember === 'object') {
                if (alreadySerialized.indexOf(currentMember) >= 0) {
                    continue;
                }
                alreadySerialized.push(currentMember);
                if (Array.isArray(currentMember) || currentMember.length) {
                    res[i] = [];
                    for (var j = 0; j < currentMember.length; j++) {
                        const arrayItem = currentMember[j];
                        if (typeof arrayItem === 'object') {
                            res[i].push(me.getSerializableObject(arrayItem, alreadySerialized, currentMemberSpec, includeDefaults));
                        } else {
                            res[i].push(arrayItem);
                        }
                    }
                } else {
                    //the browser provides some member (like plugins) as hash with index as key, if length == 0 we shall not convert it
                    if (currentMember.length === 0) {
                        res[i] = [];
                    } else {
                        res[i] = me.getSerializableObject(currentMember, alreadySerialized, currentMemberSpec, includeDefaults);
                    }
                }


            } else {
                // string, number or boolean
                if (currentMember === Infinity) { //inifity is not serialized by JSON.stringify
                    currentMember = "Infinity";
                }
                if (currentMember !== null) { //needed because the default json serializer in jsinterop serialize null values
                    res[i] = currentMember;
                }
            }
        }
        return res;
    };
    this.navigator = new (function () {
        this.geolocation = new (function () {
            this.getCurrentPosition = function (options) {
                return new Promise(function (resolve) {
                    navigator.geolocation.getCurrentPosition(
                        position => resolve({ location: me.getSerializableObject(position) }),
                        error => resolve({ error: me.getSerializableObject(error) }),
                        options)
                });
            };
            this.watchPosition = function (options, wrapper) {
                return navigator.geolocation.watchPosition(
                    position => {
                        const result = { location: me.getSerializableObject(position) };
                        return wrapper.invokeMethodAsync('Invoke', result);
                    },
                    error => wrapper.invokeMethodAsync('Invoke', { error: me.getSerializableObject(error) }),
                    options
                );
            };
        })();
        this.getBattery = function () {
            return new Promise(function (resolve, reject) {
                if (navigator.battery) {//some browser does not implement getBattery but battery instead see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/battery
                    var res = me.getSerializableObject(navigator.battery);
                    resolve(res);
                }
                else if ('getBattery' in navigator) {
                    navigator.getBattery().then(
                        function (battery) {
                            var res = me.getSerializableObject(battery);
                            resolve(res);
                        }
                    );
                }
                else {
                    resolve(null);
                }
            });
        }
    })();
})();