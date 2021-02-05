using Microsoft.JSInterop;
using System;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace BrowserInterop.Extensions
{
    /// <summary>
    /// Represents a js object reference, send it to the js interop api and it will be seen as an instance instead of a serialized/deserialized object
    /// </summary>
    public class JsRuntimeObjectRef : IAsyncDisposable
    {
        internal IJSRuntime JsRuntime { get; set; }

        [JsonPropertyName("__jsObjectRefId")] public int JsObjectRefId { get; set; }

        private ValueTask RemoveObjectRef()
        {
            const string identifier = "browserInterop.removeObjectRef";

            switch (JsRuntime)
            {
                case IJSInProcessRuntime js:
                    js.InvokeVoid(identifier, JsObjectRefId);
                    return default;
                default:
                    return JsRuntime.InvokeVoidAsync(identifier, JsObjectRefId);
            }
        }
#pragma warning disable 4014, CA2012, CA1031
        ~JsRuntimeObjectRef()
        {
            Cleanup(); // Cannot wait inside a finalizer.

            async ValueTask Cleanup()
            {
                try
                {
                    await RemoveObjectRef().ConfigureAwait(false);
                }
                catch
                {
                    // Catch any thrown exceptions during cleanup, as it won't go observed by the finalizer.
                }
            }
        }
#pragma warning restore

        public async ValueTask DisposeAsync()
        {
            await RemoveObjectRef().ConfigureAwait(false);
            GC.SuppressFinalize(this);
        }
    }
}
