chrome.runtime.onInstalled.addListener(async () => {
  const response = await fetch(chrome.runtime.getURL("settings.json"));
  const settings = await response.json();

  let socket = null;


  var useragent = "";
  chrome.webRequest.onBeforeSendHeaders.addListener(
    function (details) {
      if (!useragent) return;
      const headers = details.requestHeaders;

      for (let i = 0; i < headers.length; i++) {
        if (headers[i].name.toLowerCase() === 'user-agent') {
          headers[i].value = useragent;
          break;
        }
      }
      return { requestHeaders: headers };
    },
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"]
  );

  // WebSocket üzerinden mesaj göndermeyi kolaylaştıran yardımcı fonksiyon
  function sendSocketMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  // Tab olaylarını dinle
  chrome.tabs.onCreated.addListener((tab) => {
    if (socket) sendSocketMessage({ event: "tabcreated", tab });
  });

  // Komutları işlemek için işleyiciler
  const commandHandlers = {
    getcookie: (event) => {
      chrome.cookies.getAll({ domain: event.getcookie }, (cookies) => {
        sendSocketMessage({ session: event.session, cookies });
      });
    },

    getallcookie: (event) => {
      chrome.cookies.getAll({}, (cookies) => {
        sendSocketMessage({ session: event.session, cookies });
      });
    },

    setcookies: (event) => {
      event.setcookies.forEach(cookie => {
        chrome.cookies.set(cookie, (result) => {
          sendSocketMessage({ session: event.session, cookies: result });
        });
      });
    },
    setUserAgent: (event) => {
      useragent = event.setUserAgent;
      sendSocketMessage({ session: event.session, userAgent: event.userAgent });
    },

    exit: () => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => chrome.tabs.remove(tab.id));
      });
    },

    closetab: (event) => {
      chrome.tabs.remove(event.closetab);
    },

    newPage: (event) => {
      chrome.tabs.create({
        url: event.newPage,
        active: true,
      }, (tab) => {
        if (!event.dontwaitLoad) {
          handleTabLoading(tab.id, event.session);
        } else {
          sendSocketMessage({ session: event.session, tab });
        }
      });
    },
    uploadFile: (event) => {
      const { tab, selector, fileData } = event;

      chrome.tabs.executeScript(tab, {
        code: `
          (async function() {
            try {
              const input = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!input || input.tagName.toLowerCase() !== 'input' || input.type.toLowerCase() !== 'file') {
                return { error: "Element is not a file input" };
              }
              const files = ${JSON.stringify(fileData)}.map(file => {
                const binaryString = atob(file.content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                return new File([bytes], file.name, { type: file.type });
              });
              
              const dataTransfer = new DataTransfer();
              files.forEach(file => dataTransfer.items.add(file));
              input.files = dataTransfer.files;
              const event = new Event('change', { bubbles: true });
              input.dispatchEvent(event);
              
              return { 
                success: true, 
                fileNames: files.map(f => f.name) 
              };
            } catch (e) {  return { error: e.message }; } })()
        `
      }, (result) => {
        sendSocketMessage({
          session: event.session,
          result: result && result[0]
        });
      });
    },
    evaluate: (event) => {
      try {
        let argsAsString = JSON.stringify(event.args || []);
        let executableCode = `(${event.code}).apply(null, ${argsAsString})`;

        chrome.tabs.executeScript(event.tab, {
          code: executableCode
        }, (result) => {
          sendSocketMessage({
            session: event.session,
            result: result && result[0]
          });
        });
      } catch (e) {
        sendSocketMessage({ session: event.session, error: e.message });
      }
    },

    mouse: (event) => {
      if (event.wheel) {
        chrome.tabs.executeScript(event.tab, {
          code: `window.scrollBy(${event.deltaX}, ${event.deltaY});`
        }, (result) => {
          sendSocketMessage({ session: event.session, result });
        });
      }
      else if (event.click) {
        chrome.tabs.executeScript(event.tab, {
          code: `
            (function() {
              try {
                const mouseEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: ${event.x},
                  clientY: ${event.y}
                });
                
                document.elementFromPoint(${event.x}, ${event.y})?.dispatchEvent(mouseEvent);
                return true;
              } catch(e) {
                return { error: e.message };
              }
            })()
          `
        }, (result) => {
          sendSocketMessage({ session: event.session, result: result && result[0] });
        });
      }
      else if (event.move) {
        chrome.tabs.executeScript(event.tab, {
          code: `
            (function() {
              try {
                const moveEvent = new MouseEvent('mousemove', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: ${event.x},
                  clientY: ${event.y}
                });
                
                document.elementFromPoint(${event.x}, ${event.y})?.dispatchEvent(moveEvent);
                return true;
              } catch(e) {
                return { error: e.message };
              }
            })()
          `
        }, (result) => {
          sendSocketMessage({ session: event.session, result: result && result[0] });
        });
      }
      else if (event.down) {
        chrome.tabs.executeScript(event.tab, {
          code: `
            (function() {
              try {
                const downEvent = new MouseEvent('mousedown', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: ${event.button || 0},
                  buttons: 1 << ${event.button || 0},
                  clientX: window._mouseX || 0,
                  clientY: window._mouseY || 0
                });
                
                const element = document.elementFromPoint(window._mouseX || 0, window._mouseY || 0);
                element?.dispatchEvent(downEvent);
                return true;
              } catch(e) {
                return { error: e.message };
              }
            })()
          `
        }, (result) => {
          sendSocketMessage({ session: event.session, result: result && result[0] });
        });
      }
      else if (event.up) {
        chrome.tabs.executeScript(event.tab, {
          code: `
            (function() {
              try {
                const upEvent = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: ${event.button || 0},
                  buttons: 0,
                  clientX: window._mouseX || 0,
                  clientY: window._mouseY || 0
                });
                
                const element = document.elementFromPoint(window._mouseX || 0, window._mouseY || 0);
                element?.dispatchEvent(upEvent);
                return true;
              } catch(e) {
                return { error: e.message };
              }
            })()
          `
        }, (result) => {
          sendSocketMessage({ session: event.session, result: result && result[0] });
        });
      }
    },

    setViewport: (event) => {
      const { tab, width, height } = event;
      chrome.tabs.get(tab, (tabInfo) => {
        if (chrome.runtime.lastError) {
          sendSocketMessage({
            session: event.session,
            error: chrome.runtime.lastError.message
          });
          return;
        }
        chrome.windows.update(tabInfo.windowId, {
          width: parseInt(width) + 16,
          height: parseInt(height) + 88
        }, () => {
          chrome.tabs.executeScript(tab, {
            code: `
                document.documentElement.style.width = '${parseInt(width)}px';
                document.documentElement.style.height = '${parseInt(height)}px';
                document.body.style.width = '${parseInt(width)}px';
                document.body.style.height = '${parseInt(height)}px';

                let viewport = document.querySelector('meta[name="viewport"]');
                if (!viewport) {
                  viewport = document.createElement('meta');
                  viewport.name = 'viewport';
                  document.head.appendChild(viewport);
                }
                viewport.content = 'width=${parseInt(width)}, height=${parseInt(height)}';
              `
          }, (result) => {
            sendSocketMessage({
              session: event.session
            });
          });
        });
      });
    },

    waitForSelector: (event) => {
      const { tab, selector, timeout = event.timeout ?? 30000 } = event;
      const startTime = Date.now();

      const checkElement = () => {
        chrome.tabs.executeScript(tab, {
          code: `!!document.querySelector("${selector.replace(/"/g, '\\"')}")`
        }, (result) => {
          if (chrome.runtime.lastError) return;

          if (result && result[0] === true) {
            sendSocketMessage({
              session: event.session,
              found: true
            });
            return;
          }

          if (Date.now() - startTime > timeout) {
            sendSocketMessage({
              session: event.session,
              error: `Timeout: Element "${selector}" not found within ${timeout}ms`
            });
            return;
          }

          setTimeout(checkElement, 100);
        });
      };

      checkElement();
    },
    getPageSource: (event) => {
      chrome.tabs.executeScript(event.tab, {
        code: 'document.documentElement.outerHTML'
      }, (result) => {
        sendSocketMessage({
          session: event.session,
          source: result && result[0]
        });
      });
    },
    select: (event) => {
      const { tab, selector, action, value, text, index } = event;

      let code = '';

      switch (action) {
        case 'selectByValue':
          code = `
          (function() {
            try {
              const selectElement = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!selectElement || selectElement.tagName.toLowerCase() !== 'select') {
                return { error: "Element is not a select element" };
              }
              
              selectElement.value = "${value.replace(/"/g, '\\"')}";
              const event = new Event('change', { bubbles: true });
              selectElement.dispatchEvent(event);
              
              return { 
                success: true, 
                selected: selectElement.value,
                text: selectElement.options[selectElement.selectedIndex]?.text 
              };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `;
          break;

        case 'selectByText':
          code = `
          (function() {
            try {
              const selectElement = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!selectElement || selectElement.tagName.toLowerCase() !== 'select') {
                return { error: "Element is not a select element" };
              }
              
              for (let i = 0; i < selectElement.options.length; i++) {
                if (selectElement.options[i].text === "${text.replace(/"/g, '\\"')}") {
                  selectElement.selectedIndex = i;
                  const event = new Event('change', { bubbles: true });
                  selectElement.dispatchEvent(event);
                  return { 
                    success: true, 
                    selected: selectElement.value,
                    text: selectElement.options[i].text 
                  };
                }
              }
              
              return { error: \`Option with text "${text.replace(/"/g, '\\"')}" not found\` };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `;
          break;

        case 'selectByIndex':
          code = `
          (function() {
            try {
              const selectElement = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!selectElement || selectElement.tagName.toLowerCase() !== 'select') {
                return { error: "Element is not a select element" };
              }
              
              if (${index} < 0 || ${index} >= selectElement.options.length) {
                return { error: \`Index out of range (0-\${selectElement.options.length-1})\` };
              }
              
              selectElement.selectedIndex = ${index};
              const event = new Event('change', { bubbles: true });
              selectElement.dispatchEvent(event);
              
              return { 
                success: true, 
                selected: selectElement.value,
                text: selectElement.options[${index}].text 
              };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `;
          break;

        case 'getOptions':
          code = `
          (function() {
            try {
              const selectElement = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!selectElement || selectElement.tagName.toLowerCase() !== 'select') {
                return { error: "Element is not a select element" };
              }
              
              const options = [];
              for (let i = 0; i < selectElement.options.length; i++) {
                options.push({
                  index: i,
                  value: selectElement.options[i].value,
                  text: selectElement.options[i].text,
                  selected: selectElement.options[i].selected
                });
              }
              
              return { options };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `;
          break;

        case 'getSelected':
          code = `
          (function() {
            try {
              const selectElement = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!selectElement || selectElement.tagName.toLowerCase() !== 'select') {
                return { error: "Element is not a select element" };
              }
              
              if (selectElement.selectedIndex === -1) {
                return { selected: null };
              }
              
              return {
                selected: {
                  index: selectElement.selectedIndex,
                  value: selectElement.value,
                  text: selectElement.options[selectElement.selectedIndex].text
                }
              };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `;
          break;
      }

      if (!code) return;

      chrome.tabs.executeScript(tab, { code }, (result) => {
        if (chrome.runtime.lastError) {
          sendSocketMessage({
            session: event.session,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        sendSocketMessage({
          session: event.session,
          result: result && result[0]
        });
      });
    },
    click: (event) => {
      const { tab, selector, button = 0 } = event;

      chrome.tabs.executeScript(tab, {
        code: `
          (function() {
            try {
              const element = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!element) return { error: "Element not found" };
              
              const rect = element.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              
              element.focus();
              const mouseEvent = new MouseEvent(${button} === 2 ? 'contextmenu' : 
                                               (${button} === 0 ? 'click' : 'auxclick'), {
                bubbles: true,
                cancelable: true,
                view: window,
                button: ${button},
                buttons: 1 << ${button},
                clientX: x,
                clientY: y
              });
              
              const result = element.dispatchEvent(mouseEvent);
              return { success: result };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `
      }, (result) => {
        sendSocketMessage({
          session: event.session,
          result: result && result[0]
        });
      });
    },
    dragAndDrop: (event) => {
      const { tab, sourceSelector, targetSelector, fileName, fileContent, fileType } = event;
      const isFileDrop = fileName && fileContent && fileType;

      let code;

      if (isFileDrop) {
        code = `
      (function() {
        try {
          const target = document.querySelector("${targetSelector.replace(/"/g, '\\"')}");
          if (!target) return { error: "Target element not found" };
          
          const targetRect = target.getBoundingClientRect();
          
          // Create the events
          const dragEnterEvent = new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          const dragOverEvent = new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          // Create file from base64
          const binaryString = atob("${fileContent}");
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const file = new File([bytes], "${fileName}", { type: "${fileType}" });
          
          // Create and configure DataTransfer
          const dt = new DataTransfer();
          dt.items.add(file);
          
          Object.defineProperty(dragEnterEvent, 'dataTransfer', { value: dt });
          Object.defineProperty(dragOverEvent, 'dataTransfer', { value: dt });
          Object.defineProperty(dropEvent, 'dataTransfer', { value: dt });
          
          // Dispatch events
          target.dispatchEvent(dragEnterEvent);
          target.dispatchEvent(dragOverEvent);
          dragOverEvent.preventDefault();
          target.dispatchEvent(dropEvent);
          
          return { success: true };
        } catch (e) {
          return { error: e.message };
        }
      })()
    `;
      } else {
        code = `
      (function() {
        try {
          const source = document.querySelector("${sourceSelector.replace(/"/g, '\\"')}");
          const target = document.querySelector("${targetSelector.replace(/"/g, '\\"')}");
          
          if (!source) return { error: "Source element not found" };
          if (!target) return { error: "Target element not found" };
          
          const sourceRect = source.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          
          const dragStartEvent = new MouseEvent('dragstart', {
            bubbles: true,
            cancelable: true,
            clientX: sourceRect.left + sourceRect.width / 2,
            clientY: sourceRect.top + sourceRect.height / 2
          });
          
          const dragEnterEvent = new MouseEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          const dragOverEvent = new MouseEvent('dragover', {
            bubbles: true,
            cancelable: true,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          const dropEvent = new MouseEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          const dragEndEvent = new MouseEvent('dragend', {
            bubbles: true,
            cancelable: true,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          let dt = new DataTransfer();
          Object.defineProperty(dragStartEvent, 'dataTransfer', {
            value: dt
          });
          Object.defineProperty(dragEnterEvent, 'dataTransfer', {
            value: dt
          });
          Object.defineProperty(dragOverEvent, 'dataTransfer', {
            value: dt
          });
          Object.defineProperty(dropEvent, 'dataTransfer', {
            value: dt
          });
          Object.defineProperty(dragEndEvent, 'dataTransfer', {
            value: dt
          });
          
          source.dispatchEvent(dragStartEvent);
          target.dispatchEvent(dragEnterEvent);
          target.dispatchEvent(dragOverEvent);
          dragOverEvent.preventDefault();
          target.dispatchEvent(dropEvent);
          source.dispatchEvent(dragEndEvent);
          
          return { success: true };
        } catch (e) {
          return { error: e.message };
        }
      })()
    `;
      }

      chrome.tabs.executeScript(tab, { code }, (result) => {
        sendSocketMessage({
          session: event.session,
          result: result && result[0]
        });
      });
    },
    screenshot: (event) => {
      const { tab, options } = event;
      const { type, quality } = options || {};

      const captureOptions = { format: type || 'png' };
      if (quality && (type === 'jpeg' || type === 'webp')) {
        captureOptions.quality = quality;
      }

      chrome.tabs.get(tab, (tabInfo) => {
        if (chrome.runtime.lastError) {
          sendSocketMessage({
            session: event.session,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        chrome.tabs.captureVisibleTab(tabInfo.windowId, captureOptions, (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendSocketMessage({
              session: event.session,
              error: chrome.runtime.lastError.message
            });
            return;
          }

          const base64Data = dataUrl.replace(/^data:image\/(png|jpeg|webp);base64,/, '');
          sendSocketMessage({
            session: event.session,
            data: base64Data
          });
        });
      });
    },

    type: (event) => {
      const { tab, selector, text } = event;

      let code;
      if (selector) {
        code = `
        (function() {
          try {
            const element = document.querySelector("${selector.replace(/"/g, '\\"')}");
            if (!element) return { error: "Element not found" };
            
            element.focus();
            
            // Clear existing content if it's an input or textarea
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
              element.value = '';
            }
            
            // Send individual keystrokes
            const text = "${text.replace(/"/g, '\\"')}";
            for (let i = 0; i < text.length; i++) {
              const char = text[i];
              
              // Create keyboard events
              const keyDown = new KeyboardEvent('keydown', {
                key: char,
                code: 'Key' + char.toUpperCase(),
                bubbles: true,
                cancelable: true
              });
              
              const keyPress = new KeyboardEvent('keypress', {
                key: char,
                code: 'Key' + char.toUpperCase(),
                bubbles: true,
                cancelable: true
              });
              
              const keyUp = new KeyboardEvent('keyup', {
                key: char,
                code: 'Key' + char.toUpperCase(),
                bubbles: true,
                cancelable: true
              });
              
              element.dispatchEvent(keyDown);
              element.dispatchEvent(keyPress);
              
              // Update value for input elements
              if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.value += char;
                // Trigger input event
                const inputEvent = new Event('input', { bubbles: true });
                element.dispatchEvent(inputEvent);
              }
              
              element.dispatchEvent(keyUp);
            }
            
            // Trigger change event
            const changeEvent = new Event('change', { bubbles: true });
            element.dispatchEvent(changeEvent);
            
            return { success: true };
          } catch (e) {
            return { error: e.message };
          }
        })()
      `;
      } else {
        code = `
        (function() {
          try {
            const element = document.activeElement;
            
            // Send individual keystrokes
            const text = "${text.replace(/"/g, '\\"')}";
            for (let i = 0; i < text.length; i++) {
              const char = text[i];
              
              // Create keyboard events
              const keyDown = new KeyboardEvent('keydown', {
                key: char,
                code: 'Key' + char.toUpperCase(),
                bubbles: true,
                cancelable: true
              });
              
              const keyPress = new KeyboardEvent('keypress', {
                key: char,
                code: 'Key' + char.toUpperCase(),
                bubbles: true,
                cancelable: true
              });
              
              const keyUp = new KeyboardEvent('keyup', {
                key: char,
                code: 'Key' + char.toUpperCase(),
                bubbles: true,
                cancelable: true
              });
              
              element.dispatchEvent(keyDown);
              element.dispatchEvent(keyPress);
              
              // Update value for input elements
              if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.value += char;
                // Trigger input event
                const inputEvent = new Event('input', { bubbles: true });
                element.dispatchEvent(inputEvent);
              }
              
              element.dispatchEvent(keyUp);
            }
            
            // Trigger change event if appropriate
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
              const changeEvent = new Event('change', { bubbles: true });
              element.dispatchEvent(changeEvent);
            }
            
            return { success: true };
          } catch (e) {
            return { error: e.message };
          }
        })()
      `;
      }

      chrome.tabs.executeScript(tab, { code }, (result) => {
        sendSocketMessage({
          session: event.session,
          result: result && result[0]
        });
      });
    },
    focus: (event) => {
      const { tab, selector } = event;

      chrome.tabs.executeScript(tab, {
        code: `
          (function() {
            try {
              const element = document.querySelector("${selector.replace(/"/g, '\\"')}");
              if (!element) return { error: "Element not found" };
              
              element.focus();
              return { success: true };
            } catch (e) {
              return { error: e.message };
            }
          })()
        `
      }, (result) => {
        sendSocketMessage({
          session: event.session,
          result: result && result[0]
        });
      });
    },
    keyboard: (event) => {
      const { tab, action, key } = event;

      // Improved key code mapping
      const getKeyCode = (key) => {
        const specialKeys = {
          'Enter': 'Enter',
          'Tab': 'Tab',
          'Escape': 'Escape',
          'ArrowLeft': 'ArrowLeft',
          'ArrowRight': 'ArrowRight',
          'ArrowUp': 'ArrowUp',
          'ArrowDown': 'ArrowDown',
          'Backspace': 'Backspace',
          'Delete': 'Delete',
          'Home': 'Home',
          'End': 'End',
          'PageUp': 'PageUp',
          'PageDown': 'PageDown'
        };

        return specialKeys[key] || (key.length === 1 ? `Key${key.toUpperCase()}` : key);
      };

      const code = `
    (function() {
      try {
        const element = document.activeElement;
        const keyValue = ${JSON.stringify(key)};
        const keyCode = ${JSON.stringify(getKeyCode(key))};
        
        const createKeyboardEvent = (type) => {
          return new KeyboardEvent(type, {
            key: keyValue,
            code: keyCode,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          });
        };
        
        // Common keys handled specially
        if (keyValue === "Enter" && element.tagName === "INPUT") {
          if (element.form) {
            element.form.submit();
          }
        }
        
        if (${JSON.stringify(action)} === 'press') {
          element.dispatchEvent(createKeyboardEvent('keydown'));
          element.dispatchEvent(createKeyboardEvent('keypress'));
          element.dispatchEvent(createKeyboardEvent('keyup'));
          
          // Special handling for input fields
          if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && keyValue.length === 1) {
            element.value += keyValue;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } 
        else if (${JSON.stringify(action)} === 'down') {
          element.dispatchEvent(createKeyboardEvent('keydown'));
        } 
        else if (${JSON.stringify(action)} === 'up') {
          element.dispatchEvent(createKeyboardEvent('keyup'));
        }
        
        return { success: true, activeElement: element.tagName };
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    })()
  `;

      chrome.tabs.executeScript(tab, { code }, (result) => {
        if (chrome.runtime.lastError) {
          sendSocketMessage({
            session: event.session,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        sendSocketMessage({
          session: event.session,
          result: result && result[0]
        });
      });
    },
    waitForNavigation: (event) => {
      const { tab, timeout = 30000 } = event;
      const startTime = Date.now();
      
      let navigationCompleted = false;
      
      const listener = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId === tab && changeInfo.status === 'complete') {
          navigationCompleted = true;
          chrome.tabs.onUpdated.removeListener(listener);
          sendSocketMessage({ 
            session: event.session, 
            success: true,
            url: updatedTab.url
          });
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
      
      setTimeout(() => {
        if (!navigationCompleted) {
          chrome.tabs.onUpdated.removeListener(listener);
          sendSocketMessage({ 
            session: event.session, 
            error: `Navigation timeout exceeded: ${timeout}ms`
          });
        }
      }, timeout);
    },
  }


  function handleTabLoading(tabId, sessionId) {
    const listener = (updatedTabId, changeInfo, updatedTab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        sendSocketMessage({ session: sessionId, tab: updatedTab, loaded: true });
        chrome.tabs.onUpdated.removeListener(listener);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  }

  function connectWebSocket() {
    socket = new WebSocket('ws://localhost:' + settings.port);

    socket.onopen = () => sendSocketMessage({ connected: true });

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const commandType = Object.keys(data).find(key =>
          key !== 'session' && key !== 'args' && commandHandlers[key]
        );

        if (commandType && commandHandlers[commandType]) {
          commandHandlers[commandType](data);
        }
      } catch (error) {
        console.error('Mesaj işleme hatası:', error);
      }
    };

    socket.onerror = (error) => console.error('WebSocket error:', error);
    socket.onclose = () => setTimeout(connectWebSocket, 5000);
  }

  connectWebSocket();

});