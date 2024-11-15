export class TextareaHeader {
  constructor(props) {
    const el = document.createElement('textarea');

    // el.value = props.value !== null ? String(props.value) : '';
    // el.style.font = 'none';
    // el.style.backgroundColor = 'white';
    // el.style.overflow = 'auto';
    // el.style.lineHeight = '20px'; // 한 줄의 높이를 20픽셀로 설정
    // el.style.resize = 'none';
    el.value = props.value !== null ? String(props.value) : '';
    el.style.font = 'inherit';
    el.style.backgroundColor = 'white';
    el.style.fontFamily ='monospace';
    el.style.overflow = 'auto';
    el.style.lineHeight = '20px';
    el.style.resize = 'none';

// 수정된 속성들
    el.style.whiteSpace = 'pre-wrap'; // 개행 유지
    el.style.wordBreak = 'break-word'; // 긴 단어의 줄바꿈 처리
    el.style.overflowWrap = 'break-word'; // 긴 단어가 컨테이너를 벗어나지 않도록 함
    el.style.padding = '5px';
    el.style.border = '1px solid #ccc';
    el.style.boxSizing = 'border-box';
    el.style.minHeight = '100px';
    el.style.width = '100%';

// 불필요한 줄바꿈 방지를 위한 추가 속성
    el.style.wordSpacing = 'normal'; // 단어 간격 정상화
    el.style.letterSpacing = 'normal'; // 글자 간격 정상화
    el.style.textRendering = 'optimizeLegibility'; // 텍스트 렌더링 최적화

// 접근성 향상
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('role', 'textbox');

    this.el = el;
  }

  getValue() {
    //console.log('this.el.value >> ', this.el.value);
    return this.el.value;
  }

  getElement() {
    //console.log('this.el >> ', this.el);
    return this.el;
  }

  mounted() {
    //console.log('mount >> ', this);
    this.el.select();
    this.el.focus();
    // this.el.scrollLeft = 0;
  }

  beforeDestory(){
    //console.log('beforeDestory >> ', this);
  }
}
