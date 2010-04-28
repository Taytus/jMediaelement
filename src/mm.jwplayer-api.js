/**!
 * Part of the jMediaelement-Project | http://github.com/aFarkas/jMediaelement
 * @author Alexander Farkas
 * Copyright 2010, Alexander Farkas
 * Dual licensed under the MIT or GPL Version 2 licenses.
 */

(function($){
	var doc = document,
		rep = /^jwPlayer-/
	;
	
	function getAPI(id){
		id = id.replace(rep, '');
		return $.data(doc.getElementById(id), 'mediaElemSupport').apis.jwPlayer;
	}
	var privJwEvents = {
		View: {
			PLAY: function(obj){
				var api = obj.state && getAPI(obj.id);
				if(!api){return;}
				api._trigger('play');
				api._isPlaystate = true;
			}
		},
		Model: {
			META: function(obj){
				if(obj.type === 'metadata'){
					var api = getAPI(obj.id);
					if(!api){return;}
					api._trigger({
						type: 'loadedmeta',
						duration: obj.duration
					});
				}
				
			},
			TIME: function(obj){
				var api = getAPI(obj.id),
					e 	= {
							type: 'timechange',
							time: obj.position
						}
				;
				if(!api){return;}
				
				//workaround: meta isn´t triggered on audio | ToDo: Is this needed with jwplayer 5.1.x?
				if(!api.loadedmeta){
					api._trigger({
						type: 'loadedmeta',
						duration: obj.duration
					});
				}
				
				
				api.currentPos = obj.position;
				if(obj.duration){
					e.duration = obj.duration;
					e.timeProgress = obj.position / obj.duration * 100;
				}
				api._trigger(e);
			},
			STATE: function(obj){
				if(obj.newstate === 'IDLE'){
					return false;
				}
				var api = getAPI(obj.id),
					type
				;
				if(!api){return false;}
				switch(obj.newstate) {
					case 'PLAYING':
						type = 'playing';
						break;
					case 'PAUSED':
						api._isPlaystate = false;
						type = 'pause';
						break;
					case 'COMPLETED':
						api._isPlaystate = false;
						type = 'ended';
						break;
					case 'BUFFERING':
						type = 'waiting';
					break;
				}
				
				if(type){
					api._trigger(type);
				}
				return type;
			}
		},
		Controller: {
			VOLUME: function(obj){
				var api = getAPI(obj.id);
				if(!api){return;}
				api._trigger({type: 'volumelevelchange', volumelevel: obj.percentage});
			},
			MUTE: function(obj){
				var api = getAPI(obj.id);
				if(!api){return;}
				api._trigger({type: 'mute', isMuted: obj.state});
			}
		}
	};
	window.jwEvents = {
		four: $.extend(true, {}, privJwEvents, {
			Model: {
				LOADED: function(obj){
					var api = getAPI(obj.id);
					if(!api){return;}
					var evt = {
						type: 'progresschange',
						lengthComputable: !!(obj.total)
					};
					if(obj.total){
						$.extend(evt, {
							relLoaded: obj.total / obj.loaded * 100
						});
						api._buffered = evt.relLoaded;
					}
					api._trigger(evt);
				}
			}
			
		}),
		five: $.extend(true, {}, privJwEvents, {
			Model: {
				BUFFER: function(obj){
					var api = getAPI(obj.id);
					if(!api){return;}
					var evt = {
						type: 'progresschange',
						relLoaded: obj.percentage,
						relStart: 0
					};
					api._buffered = obj.percentage;
					api._trigger(evt);
				},
				STATE: function(obj){
					var state = privJwEvents.Model.STATE(obj);
					if(state === 'playing'){
						var api = getAPI(obj.id);
						if(!api){return;}
						api._trigger('playing');
						api._isPlaystate = true;
					}
				}
			}
		})
	};
	
	window.playerReady = function (obj) {
		
		var api = getAPI(obj.id);
		if(!api){return;}
		//https://bugzilla.mozilla.org/show_bug.cgi?id=90268 every html5video shim has this problem fix it!!!
		if(api.isAPIReady){
			if(!api.apiElem.sendEvent){
				api._reInit();
				return;
			} else {
				setTimeout(function(){
					if( api._lastLoad ){
						api._mmload(api._lastLoad.file, api._lastLoad.image);
					}
					if(api._isPlaystate && !(api.apiElem.getConfig() || {}).autostart){
						api.play();
					}
				}, 20);
				
			}
			setTimeout(function(){
				api._trigger('jmeflashRefresh');
			}, 20);
		}
		
		var apiVersion = (parseInt(obj.version, 10) > 4)? 'five' : 'four';
		//add events
		$.each(jwEvents[apiVersion], function(mvcName, evts){
			$.each(evts, function(evtName){
				api.apiElem['add'+ mvcName +'Listener'](evtName, 'jwEvents.'+ apiVersion +'.'+ mvcName +'.'+ evtName);
			});
		});
		
		//preload workaround
		setTimeout(function(){
			var cfg = $.attr(api.element, 'getConfig');
			if(!cfg.autoplay){
				if( api.nodeName === 'audio' && cfg.preload === 'metadata' ){
					api.apiElem.sendEvent('PLAY', 'true');
					api.apiElem.sendEvent('PLAY', 'false');
				} else if( api.nodeName === 'video' && cfg.preload !== 'none' && !cfg.poster && !api.currentPos ){
					api.currentTime(0);
				}
			}
			api._trigger('mmAPIReady');
		}, 20);		
	};
	
	var jwAPI = {
		_init: function(){
			this._buffered = this._buffered || 0;
		},
		_reInitCount: 0,
		_reInitTimer: false,
		_reInit: function(){
			var that = this;
			if(this._reInitCount < 5){
				this.visualElem[0].style.overflow = 'visible';
				setTimeout(function(){
					that.visualElem[0].style.overflow = 'hidden';
				}, 0);
			}
			this._reInitCount++;
			
			if(!this._reInitTimer){
				this._reInitTimer = true;
				setTimeout(function(){
					that._reInitCount = 0;
					that._reInitTimer = false;
				}, 20000);
			}
		},
		play: function(){
			this.apiElem.sendEvent('PLAY', 'true');
			this._isPlaystate = true;
			this._trigger('play');
		},
		pause: function(){
			this.apiElem.sendEvent('PLAY', 'false');
		},
		_isPlaying: function(){
			var cfg = this.apiElem.getConfig();
			return (cfg) ? (cfg.state === 'PLAYING' ) : undefined;
		},
		_mmload: function(src, poster){
			this._lastLoad = {
				file: src,
				image: poster || false
			};
			this.apiElem.sendEvent('LOAD', this._lastLoad);
			if(this.isAPIActive && $.attr(this.element, 'autoplay')){
				this.apiElem.sendEvent('PLAY', 'true');
			} else {
				this.apiElem.sendEvent('PLAY', 'false');
			}
		},
		muted: function(state){
			if(typeof state !== 'boolean'){
				var cfg = this.apiElem.getConfig();
				return (cfg || {}).mute;
			} 
			this.apiElem.sendEvent('mute', (state) ? 'true' : false);
		},
		_isSeekable: function(t){
			var file = this.getCurrentSrc();
			if(this._buffered === 100 || this.embedOpts.jwPlayer.isStream || (file.indexOf('http') !== 0 && file.indexOf('file') !== 0)){
				return true;
			}
			var dur = this.getDuration();
			if(!dur){
				return false;
			}
			return (t / dur * 100 < this._buffered);
		},
		currentTime: function(t){
			if(!isFinite(t)){
				return this.currentPos || 0;
			}
			var api 			= this,
				wantsPlaying 	= (/PLAYING|BUFFERING/.test( this.apiElem.getConfig().state)),
				doSeek 			= function(){
					api.apiElem.sendEvent('SEEK', t);
					unbind();
					if(!wantsPlaying){
						api.apiElem.sendEvent('PLAY', 'false');
					}
					api.currentPos = t;
					api._trigger({type: 'timechange', time: t});
				},
				unbind 			= function(){
					$(api.element).unbind('.jwseekrequest');
				}
			;
			if(!wantsPlaying){
				this.apiElem.sendEvent('PLAY', 'true');
				this.apiElem.sendEvent('PLAY', 'false');
			}
			clearTimeout(this._seekrequestTimer);
			unbind();
			if(this._isSeekable(t)){
				doSeek();
			} else {
				this.apiElem.sendEvent('PLAY', 'false');
				this._trigger('waiting');
				$(this.element)
					.bind('progresschange.jwseekrequest', function(){
						if(api._isSeekable(t)){
							var wasMuted = api.muted();
							unbind();
							clearTimeout(api._seekrequestTimer);
							if (!wasMuted) {
								api.muted(true);
							}
							api.apiElem.sendEvent('PLAY', 'true');
							api._seekrequestTimer = setTimeout(function(){
								if(!wasMuted){
									api.muted(wasMuted);
								}
								doSeek();
							}, 120);
							
							
						}
					})
					.bind('mediareset.jwseekrequest', unbind)
					.bind('play.jwseekrequest', function(){
						api.apiElem.sendEvent('PLAY', 'false');
						api._trigger('waiting');
						wantsPlaying = true;
					})
					.bind('pause.jwseekrequest', function(){
						wantsPlaying = false;
					})
				;
				
				//seek aborted
				this._seekrequestTimer = setTimeout(function(){
					$(api.element)
						.unbind('play.jwseekrequest')
						.unbind('pause.jwseekrequest')
						.bind('play.jwseekrequest', unbind)
						.bind('pause.jwseekrequest', unbind)
					;
				}, 999);
			}
		},
		getDuration: function(){
			var t = this.apiElem.getPlaylist()[0].duration || 0;
			return t < 0 ? 0 : t;
		},
		volume: function(v){
			if(!isFinite(v)){
				return parseInt(this.apiElem.getConfig().volume, 10);
			}
			this.apiElem.sendEvent('VOLUME', ''+v);
		},
		getCurrentSrc: function(){
			return (this.apiElem.getConfig() || {}).file || '';
		}
	};
	
	// ff flash refreshbug https://bugzilla.mozilla.org/show_bug.cgi?id=90268 
	if($.browser.mozilla){
		$.extend(jwAPI, {
			isJMEReady: function(){
				var ret = false;
				if(this.isAPIReady && this.apiElem.sendEvent && this.apiElem.getConfig){
					this.apiElem.getConfig();
					ret = true;					
				}
				return ret;
			}
		});
	}
	
	
	$.multimediaSupport.add('jwPlayer', 'video', jwAPI);
	$.multimediaSupport.add('jwPlayer', 'audio', jwAPI);
})(jQuery);
