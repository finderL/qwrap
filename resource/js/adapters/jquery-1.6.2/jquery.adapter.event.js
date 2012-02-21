/**
 * 这是QWrap专门为JQ写的适配。大约能兼容80%左右的功能
 * 只要写组件的时候不是用到了太BT的方法，一般就木有问题了
 * 砍掉方法里面了一些太BT的功能，JQ经常用一大堆代码实现一个很复杂而强大的功能，但是实际开发中很少需要用到
 * 按照QWrap的价值观，如果一个方法有80%以上的复杂度，只有20%的使用而且并不是不可替代的，一般砍掉这个功能
 *
 * @author akira.cn@gmail.com
 * @copyright (c) 2011 WED Team
 * @lisense http://www.qwrap.com - http://tangram.baidu.com/docs/bsd.html
 */

(function(){

//标准化DOM Event对象
jQuery.Event = function(evt, props){
	//evt = QW.EventH.standardize(evt);
	if(evt && !jQuery.isString(evt)){
		var _originalEvent = evt;
		evt = new QW.CustEvent(null, evt.type, props);
		evt.originalEvent = _originalEvent;
	}else{
		evt = new QW.CustEvent(null, evt, props);
	}

	// Events bubbling up the document may have been marked as prevented
	// by a handler lower down the tree; reflect the correct value.
	evt.isDefaultPrevented = (evt.defaultPrevented || evt.returnValue === false ||
		evt.getPreventDefault && evt.getPreventDefault()) ? function(){return true} : function(){return false};

	if(props){
		jQuery.extend(evt, props);
	}

	return evt;
}

//因为JQ ui有很多用异步传event参数的应用，而IE的event不支持异步传参，因为它在事件流结束后被销毁了
//因此要hook一下fireHandler
var neth = jQuery.hook(jQuery.dump(QW.EventTargetH, ["fireHandler"]), "before", function(args){
	if(jQuery.browser.msie){
		args[1] = jQuery.extend({}, args[1]);
	}
});

jQuery.extend(QW.EventTargetH, neth);

jQuery.event = {
	/**
	 * special是JQ的自定义事件接口
	 * bind的时候会将special的类型给注册到jQuery.fn的custevent上
	 * bind的时候执行setup，unbind的时候执行teardown，fire的时候执行handler
	 * 通过handler去执行jQuery.event.handle(event)
	 * 这样等于用handler去包装event，但是QWrap现在的event对象是未包装过的
	 * 所以不能覆盖type
	 * QWrap里面如果需要自定义事件，是通过更明显的CustEvent实现的，而不像jQuery这样绕
	 * 事实上QWrap不会在NodeW对象上自定义事件，自定义事件是组件完成的事情
	 * 在QWrap的设计哲学里，JQ的这种做法是带有“侵入性”的，因此不被接受
	 * 我理解JQ是试图提供机制抹平DOM事件的浏览器版本差异
	 * 但QWrap不鼓励在DOM元素上这么做（如果要向后兼容，可以在组件里面用特性检查）
	 */
	special : {
	},
	/**
	 * mix Event用的，因为简单的for in在IE的 event对象上有问题
	 * IE貌似有一种保护机制，不让读取从参数中传入的event对象属性（可能是因为window.event事件已经过期）
	 * 说到这个，顺便提一下，Wrap是一种比mix更高效率的机制，因为mix每个对象都要copy一次属性
	 * 而Wrap只需要Wrap一次方法到prototype上
	 */
	props: "altKey attrChange attrName bubbles button cancelable charCode clientX clientY ctrlKey currentTarget data detail eventPhase fromElement handler keyCode layerX layerY metaKey newValue offsetX offsetY pageX pageY prevValue relatedNode relatedTarget screenX screenY shiftKey srcElement target toElement view wheelDelta which".split(" "),
	handle: function(event){
		if(event._customType){
			QW.CustEventTargetH.fire(this, event._customType, event);
		}else{
			QW.EventTargetH.fire(this, event.type, event);
		}
	}
};
/**
 * event相关的适配，在JQ中标准的Dom Event也可以传自定义的属性过去
 * 在QWrap看来这么做很麻烦实现起来很绕，而且大多数情况下用不着，因此QWrap对标准的Dom Event不支持自定义属性
 * 不过QWrap提供的CustEvent其实是很强大的~
 * 
 * 适配器支持bind和trigger的DOM自定义事件参数，用到jQueryH.data
 */
var jQEVT_NAMESPACE = ".__JQEVT_NAMESPACE";
jQueryEventH = {
	bind: function(el, type, data, handler){
		if(/\s+/.test(type)){ //有空格分割，批量操作
			types = type.split(/\s+/g);
			for(var i = 0; i < types.length; i++){
				jQueryEventH.bind(el, types[i], data, handler);
			}
			return;	
		}
		
		var namespace = type + jQEVT_NAMESPACE;
		type = namespace.split('.')[0]; //JQ有事件命名空间的设计

		if(handler && namespace){
			el[namespace] = el[namespace] || [];
			el[namespace].push(handler);
		}
		

		
		if(jQuery.isFunction(data)){ //handler和data顺序可以调换
			var tmp = handler;
			handler = data;
			data = tmp;
		}
		
		if(el.__custEvent){  //代理自定义的用户事件
			data = data || {};
			jQuery.extend(data, {_customType: el.__custEvent});
		}

		if(handler && data){
			handler.__realHandler = (function(handler){
				return function(evt){
					var fireEventArgs = jQuery.data(el, '__custEventData');
					jQuery.data(el, '__custEventData', null); //用过以后及时清除
					if(data){
						jQuery.extend(evt, data);
					}
					if(fireEventArgs){
						jQuery.extend(evt, fireEventArgs);
					}
					return handler.call(el, evt);
				}
			})(handler);
			handler = handler.__realHandler;
		}
		
		var special;
		if((QW.Dom.isElement(el) || el.nodeType == 9 /*is document*/) 
			&& (el['on' + type] !== undefined )
			&& (!el.__custListeners || !el.__custListeners[type])){ //事件存在并且不是自定义的
			//是dom原生事件，不支持data
			QW.EventTargetH.on(el, type, handler);			
		}else if(special = jQuery.event.special[type]){
			QW.CustEvent.createEvents(el, type);		//给元素自定义事件
			QW.CustEventTargetH.on(el, type, handler);
			el.__custEvent = type;
			special.setup.call(el);
			el.__custEvent = null;
		}else if(handler){
			//否则是自定义事件，支持data
			QW.CustEvent.createEvents(el, type);
			QW.CustEventTargetH.on(el, type, handler);
		}
	},
	/**
	 * JQ有实现这种只执行一次的事件
	 */
	one: function(el, type, data, handler){
		if(/\s+/.test(type)){ //有空格分割，批量操作
			types = type.split(/\s+/g);
			for(var i = 0; i < types.length; i++){
				jQueryEventH.one(el, types[i], data, handler);
			}
			return;	
		}

		var namespace = type + jQEVT_NAMESPACE;
		type = namespace.split('.')[0]; //JQ有事件命名空间的设计

		if(handler && namespace){
			el[namespace] = el[namespace] || [];
			el[namespace].push(handler);
		}



		if(jQuery.isFunction(data)){ //handler和data顺序可以调换
			var tmp = handler;
			handler = data;
			data = tmp;
		}

		var realHandler = function(evt){
			handler.call(el, evt);
			jQueryEventH.unbind(el, type, realHandler);
		}
		jQueryEventH.bind(el, type, data, realHandler);
	},
	//事件代理
	delegate: function(el, selector, types, data, handler) {
		if(jQuery.isFunction(data)){
			var tmp = handler;
			handler = data;
			data = tmp;
		}
		if(handler && data){
			handler.__realHandler = (function(handler){
				return function(evt){
					var fireEventArgs = jQuery.data(el, '__custEventData');
					jQuery.data(el, '__custEventData', null); //用过以后及时清除
					if(data){
						QW.ObjectH.mix(evt, data);
					}
					if(fireEventArgs){
						QW.ObjectH.mix(evt, fireEventArgs);
					}
					return handler.call(el, evt);
				}
			})(handler);
			handler = handler.__realHandler;
		}

		types = types.split(',');
		jQuery.each(types, function(i, type){
			QW.EventTargetH.delegate(o, selector, type, handler);
		});
	},
	undelegate: function(el, selector, types, handler){
		types = types.split(',');
		jQuery.each(types, function(i, type){
			if(handler && handler.__realHandler){
				handler = handler.__realHandler;
			}
			QW.EventTargetH.undelegate(o, selector, type, handler);
		});
	},
	unbind: function(el, type, handler){
		if(/\s+/.test(type)){ //有空格分割，批量操作
			types = type.split(/\s+/g);
			for(var i = 0; i < types.length; i++){
				jQueryEventH.unbind(el, types[i], data, handler);
			}
			return;	
		}
		
		var namespace = type + jQEVT_NAMESPACE;
		type = namespace.split('.')[0]; //JQ有事件命名空间的设计

		if(handler && namespace){
			el[namespace] = el[namespace] || [];
			el[namespace].push(handler);
		}		


		var elNamespace = el[type + jQEVT_NAMESPACE];
		if(!handler && elNamespace){	//unbind整个名字空间
			for(var i = 0; i < elNamespace.length; i++){
				jQueryEventH.unbind(el, type, elNamespace[i]);
			}
			elNamespace.length = 0;
		}
		var special;
		if(handler && handler.__realHandler){
			handler = handler.__realHandler;
		}
		else if(special = jQuery.event.special[type]){
			special.teardown.call(this);
		}
		if(el.__custListeners && el.__custListeners[type]){
			//如果是自定义的
			QW.CustEventTargetH.un(el, type, handler);
		}
		else{
			QW.EventTargetH.un(el, type, handler);
		}
	},
	trigger: function(el, type, data){
		if((QW.Dom.isElement(el) || el.nodeType == 9 /*is document*/)
			&& (el['on' + type] !== undefined )
			&& (!el.__custListeners || !el.__custListeners[type])){ //事件存在并且不是自定义的
			if(data){
				jQuery.data(el, '__custEventData', data);
			}

			QW.EventTargetH.fire(el, type);
		}
		else{
			//如果是自定义的
			if(type){
				if('target' in type && type['target'] == null){
					type['target'] = el;
				}
				type = type.type || type;
				QW.CustEvent.createEvents(el, type);
			}
			QW.CustEventTargetH.fire(el, type, data);
		}
	}
};

jQuery.pluginHelper(jQueryEventH, 'operator');

/**
 * 很讨厌JQ有这一堆奇怪的方法 =.=
 */
QW.ArrayH.forEach(("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error").split(" "),
	function(o, i, arr){
		jQuery.fn[o] = function(handler){ 
			//focusin、focusout等价于focus和blur
			//也不知道对不对，先试试看，看看有没有坑
			//JQ蛋疼
			var data = {};

			if(o == "focusin") o = "focus";
			if(o == "focusout") o = "blur";

			if(o == "mouseenter"){
				data.withinElement = this;
				o = "mouseover";
			}
			if(o == "mouseleave"){
				data.withinElement = this;
				o = "mouseout";
			}

			//这个更无语，把on和fire混为一谈。。。
			if(handler){
				this.bind(o, data, handler);
			}
			else{ 
				this.trigger(o);
			}
			return this;
		}
	}
);

})();