
browserInterop = new (function () {
    let jsObjectRefs = {};
    let jsObjectRefId = 0;
    let me = this;

    const jsRefKey = '__jsObjectRefId'; // Keep in sync with ElementRef.cs

    //reviver will help me store js object ref on .net like the .net do with elementreference or dotnetobjectreference
    this.jsObjectRefRevive = function (key, value) {
        if (value &&
            typeof value === 'object' &&
            value.hasOwnProperty(jsRefKey) &&
            typeof value[jsRefKey] === 'number') {

            let id = value[jsRefKey];
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


            let netObjectRef = value.callbackRef;

            return function () {
                let args = [];
                if (!value.getJsObjectRef) {
                    for (let index = 0; index < arguments.length; index++) {
                        const element = arguments[index];
                        args.push(me.getSerializableObject(element, [], value.serializationSpec));
                    }
                } else {
                    for (let index = 0; index < arguments.length; index++) {
                        const element = arguments[index];
                        args.push(me.storeObjectRef(element));
                    }
                }
                return netObjectRef.invokeMethodAsync('Invoke', ...args);
            };
        } else {
            return value;
        }
    });
    let eventListenersIdCurrent = 0;
    let eventListeners = {};
    this.addEventListener = function (instance, propertyPath, eventName, callback) {
        let target = me.getInstanceProperty(instance, propertyPath);
        target.addEventListener(eventName, callback);
        let eventId = eventListenersIdCurrent++;
        eventListeners[eventId] = callback;
        return eventId;
    };
    this.removeEventListener = function (instance, propertyPath, eventName, eventListenersId) {
        let target = me.getInstanceProperty(instance, propertyPath);
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
        let id = jsObjectRefId++;
        jsObjectRefs[id] = obj;
        let jsRef = {};
        jsRef[jsRefKey] = id;
        return jsRef;
    }
    this.removeObjectRef = function (id) {
        delete jsObjectRefs[id];
    }
    function getPropertyList(path) {
        let res = path.replace('[', '.').replace(']', '').split('.');
        if (res[0] === "") { // if we pass "[0].id" we want to return [0,'id']
            res.shift();
        }
        return res;
    }
    this.getInstanceProperty = function (instance, propertyPath) {
        if (propertyPath === '') {
            return instance;
        }
        let currentProperty = instance;
        let splitProperty = getPropertyList(propertyPath);

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
        let currentProperty = instance;
        let splitProperty = getPropertyList(propertyPath);
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
        let data = me.getInstanceProperty(instance, propertyName);
        if (data instanceof Promise) {//needed when some properties like beforeinstallevent.userChoice are promise
            return data;
        }
        let res = me.getSerializableObject(data, [], serializationSpec);
        return res;
    };
    this.callInstanceMethod = function (instance, methodPath, ...args) {
        if (methodPath.indexOf('.') >= 0) {
            //if it's a method call on a child object we get this child object so the method call will happen in the context of the child object
            //some method like window.locaStorage.setItem  will throw an exception if the context is not expected
            let instancePath = methodPath.substring(0, methodPath.lastIndexOf('.'));
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
        let method = me.getInstanceProperty(instance, methodPath);
        return method.apply(instance, args);
    };
    this.callInstanceMethodGetRef = function (instance, methodPath, ...args) {
        return this.storeObjectRef(this.callInstanceMethod(instance, methodPath, ...args));
    };
    this.getSerializableObject = function (data, alreadySerialized, serializationSpec) {
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
        let res = (Array.isArray(data)) ? [] : {};
        if (!serializationSpec) {
            serializationSpec = "*";
        }
        for (let i in data) {
            let currentMember = data[i];

            if (typeof currentMember === 'function' || currentMember === null) {
                continue;
            }
            let currentMemberSpec;
            if (serializationSpec != "*") {
                currentMemberSpec = Array.isArray(data) ? serializationSpec : serializationSpec[i];
                if (!currentMemberSpec) {
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
                    for (let j = 0; j < currentMember.length; j++) {
                        const arrayItem = currentMember[j];
                        if (typeof arrayItem === 'object') {
                            res[i].push(me.getSerializableObject(arrayItem, alreadySerialized, currentMemberSpec));
                        } else {
                            res[i].push(arrayItem);
                        }
                    }
                } else {
                    //the browser provides some member (like plugins) as hash with index as key, if length == 0 we shall not convert it
                    if (currentMember.length === 0) {
                        res[i] = [];
                    } else {
                        res[i] = me.getSerializableObject(currentMember, alreadySerialized, currentMemberSpec);
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
                    let res = me.getSerializableObject(navigator.battery);
                    resolve(res);
                }
                else if ('getBattery' in navigator) {
                    navigator.getBattery().then(
                        function (battery) {
                            let res = me.getSerializableObject(battery);
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
