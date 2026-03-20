import { createElement, generateId, getTimestamp, showToast } from '../utils/helpers.js';

export class AuthView {
  constructor({ container, storage, onEnter }) {
    this.container = container;
    this.storage = storage;
    this.onEnter = onEnter;
    this.mode = 'user';
    this.screen = 'login';
    this.showPassword = false;
    this.loginForm = {
      account: '',
      password: ''
    };
    this.registerForm = {
      account: '',
      password: '',
      confirmPassword: '',
      email: '',
      gender: '',
      age: '',
      identity: ''
    };
  }

  render() {
    this.container.innerHTML = '';

    const wrapper = createElement('div', 'auth-entry');

    const topbar = createElement('div', 'auth-entry__topbar');
    if (this.screen === 'register') {
      topbar.appendChild(createElement('button', {
        className: 'auth-entry__admin-link',
        textContent: '返回登入',
        onClick: () => this._setScreen('login')
      }));
    } else if (this.mode === 'admin') {
      topbar.appendChild(createElement('button', {
        className: 'auth-entry__admin-link auth-entry__admin-link--active',
        textContent: '一般登入',
        onClick: () => this._setMode('user')
      }));
    } else {
      topbar.appendChild(createElement('button', {
        className: 'auth-entry__admin-link',
        textContent: 'Admin',
        onClick: () => this._setMode('admin')
      }));
    }
    wrapper.appendChild(topbar);

    const panel = createElement('section', 'auth-entry__panel');
    panel.appendChild(createElement('h1', {
      className: 'auth-entry__title',
      textContent: this._getTitle()
    }));

    const form = createElement('div', 'auth-entry__form');
    if (this.screen === 'register') {
      this._renderRegisterForm(form);
    } else {
      this._renderLoginForm(form);
    }

    panel.appendChild(form);
    wrapper.appendChild(panel);

    this.container.appendChild(wrapper);
  }

  _renderLoginForm(form) {
    const accountField = createElement('label', 'auth-entry__field');
    accountField.appendChild(createElement('span', {
      className: 'auth-entry__label',
      textContent: '帳號'
    }));
    const accountInput = createElement('input', {
      className: 'input auth-entry__input',
      type: 'text',
      value: this.loginForm.account,
      placeholder: this.mode === 'admin' ? '請輸入 Admin 帳號' : '請輸入帳號',
      autocomplete: this.mode === 'admin' ? 'username' : 'email',
      onInput: (e) => {
        this.loginForm.account = e.target.value;
      }
    });
    accountField.appendChild(accountInput);
    form.appendChild(accountField);

    const passwordField = createElement('label', 'auth-entry__field');
    passwordField.appendChild(createElement('span', {
      className: 'auth-entry__label',
      textContent: '密碼'
    }));
    const passwordRow = createElement('div', 'auth-entry__password-row');
    const passwordInput = createElement('input', {
      className: 'input auth-entry__input auth-entry__input--password',
      type: this.showPassword ? 'text' : 'password',
      value: this.loginForm.password,
      placeholder: '請輸入密碼',
      autocomplete: 'current-password',
      onInput: (e) => {
        this.loginForm.password = e.target.value;
      }
    });
    passwordRow.appendChild(passwordInput);
    passwordRow.appendChild(createElement('button', {
      className: 'auth-entry__password-toggle',
      type: 'button',
      textContent: this.showPassword ? '🙈' : '👁',
      'aria-label': this.showPassword ? '隱藏密碼' : '顯示密碼',
      onClick: () => this._togglePassword()
    }));
    passwordField.appendChild(passwordRow);
    form.appendChild(passwordField);

    const actions = createElement('div', 'auth-entry__actions');
    actions.appendChild(createElement('button', {
      className: 'btn btn--primary btn--full',
      textContent: this.mode === 'admin' ? '登入 Admin' : '登入',
      onClick: () => this._submitCredential('login')
    }));

    if (this.mode !== 'admin') {
      actions.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full',
        textContent: '註冊',
        onClick: () => this._setScreen('register')
      }));

      actions.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full',
        textContent: 'Line 登入',
        onClick: () => this._enter({
          mode: 'user',
          title: 'LINE 使用者入口',
          provider: 'line',
          providerLabel: 'LINE'
        })
      }));

      actions.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full',
        textContent: 'Google 登入',
        onClick: () => this._enter({
          mode: 'user',
          title: 'Google 使用者入口',
          provider: 'google',
          providerLabel: 'Google'
        })
      }));

      actions.appendChild(createElement('button', {
        className: 'btn btn--outline btn--full',
        textContent: '訪客登入',
        onClick: () => this._enter({
          mode: 'guest',
          title: '訪客模式',
          provider: 'guest',
          providerLabel: '訪客'
        })
      }));
    }

    form.appendChild(actions);
  }

  _renderRegisterForm(form) {
    form.appendChild(this._createTextField({
      label: '帳號',
      value: this.registerForm.account,
      placeholder: '請輸入帳號',
      autocomplete: 'username',
      onInput: (value) => { this.registerForm.account = value; }
    }));
    form.appendChild(this._createPasswordField({
      label: '密碼',
      value: this.registerForm.password,
      placeholder: '請輸入密碼',
      autocomplete: 'new-password',
      onInput: (value) => { this.registerForm.password = value; }
    }));
    form.appendChild(this._createPasswordField({
      label: '確認密碼',
      value: this.registerForm.confirmPassword,
      placeholder: '請再次輸入密碼',
      autocomplete: 'new-password',
      onInput: (value) => { this.registerForm.confirmPassword = value; }
    }));
    form.appendChild(this._createTextField({
      label: '信箱',
      type: 'email',
      value: this.registerForm.email,
      placeholder: 'example@email.com',
      autocomplete: 'email',
      onInput: (value) => { this.registerForm.email = value; }
    }));

    const optionalTitle = createElement('div', {
      className: 'auth-entry__optional-title',
      textContent: '以下欄位先保留，不必填'
    });
    form.appendChild(optionalTitle);

    form.appendChild(this._createTextField({
      label: '性別',
      value: this.registerForm.gender,
      placeholder: '可先留空',
      onInput: (value) => { this.registerForm.gender = value; }
    }));
    form.appendChild(this._createTextField({
      label: '年齡',
      type: 'number',
      value: this.registerForm.age,
      placeholder: '可先留空',
      inputmode: 'numeric',
      onInput: (value) => { this.registerForm.age = value; }
    }));
    form.appendChild(this._createTextField({
      label: '身分',
      value: this.registerForm.identity,
      placeholder: '可先留空',
      onInput: (value) => { this.registerForm.identity = value; }
    }));

    const actions = createElement('div', 'auth-entry__actions');
    actions.appendChild(createElement('button', {
      className: 'btn btn--primary btn--full',
      textContent: '建立帳號',
      onClick: () => this._submitRegistration()
    }));
    actions.appendChild(createElement('button', {
      className: 'btn btn--outline btn--full',
      textContent: '返回登入',
      onClick: () => this._setScreen('login')
    }));
    form.appendChild(actions);
  }

  _createTextField({ label, value, onInput, type = 'text', placeholder = '', autocomplete = 'off', inputmode = '' }) {
    const field = createElement('label', 'auth-entry__field');
    field.appendChild(createElement('span', {
      className: 'auth-entry__label',
      textContent: label
    }));
    field.appendChild(createElement('input', {
      className: 'input auth-entry__input',
      type,
      value,
      placeholder,
      autocomplete,
      inputmode,
      onInput: (e) => onInput(e.target.value)
    }));
    return field;
  }

  _createPasswordField({ label, value, onInput, placeholder, autocomplete }) {
    const field = createElement('label', 'auth-entry__field');
    field.appendChild(createElement('span', {
      className: 'auth-entry__label',
      textContent: label
    }));
    const row = createElement('div', 'auth-entry__password-row');
    row.appendChild(createElement('input', {
      className: 'input auth-entry__input auth-entry__input--password',
      type: this.showPassword ? 'text' : 'password',
      value,
      placeholder,
      autocomplete,
      onInput: (e) => onInput(e.target.value)
    }));
    row.appendChild(createElement('button', {
      className: 'auth-entry__password-toggle',
      type: 'button',
      textContent: this.showPassword ? '🙈' : '👁',
      'aria-label': this.showPassword ? '隱藏密碼' : '顯示密碼',
      onClick: () => this._togglePassword()
    }));
    field.appendChild(row);
    return field;
  }

  _getTitle() {
    if (this.screen === 'register') return '註冊';
    return this.mode === 'admin' ? 'Admin 登入' : '登入';
  }

  _setMode(mode) {
    this.mode = mode;
    this.screen = 'login';
    this.showPassword = false;
    this.render();
  }

  _setScreen(screen) {
    this.screen = screen;
    this.mode = 'user';
    this.showPassword = false;
    this.render();
  }

  _togglePassword() {
    this.showPassword = !this.showPassword;
    this.render();
  }

  _submitCredential(action) {
    const account = this.loginForm.account.trim();
    const password = this.loginForm.password;

    if (!account || !password) {
      showToast('請先輸入帳號與密碼');
      return;
    }

    if (this.mode === 'admin') {
      if (!this._isLocalCredentialValid(account, password)) {
        showToast('帳號密碼錯誤');
        return;
      }

      this._enter({
        mode: 'admin',
        title: 'Admin 入口',
        provider: 'admin',
        providerLabel: 'Admin',
        account,
        action
      });
      return;
    }

    if (this._isLocalCredentialValid(account, password)) {
      this._enter({
        mode: 'user',
        title: '一般用戶入口',
        provider: 'account',
        providerLabel: '一般用戶',
        account,
        action
      });
      return;
    }

    const user = this.storage.findRegisteredUserByAccount(account);
    if (!user || user.password !== password) {
      showToast('帳號密碼錯誤');
      return;
    }

    this._enter({
      mode: 'user',
      title: '一般用戶入口',
      provider: 'account',
      providerLabel: user.account,
      account: user.account,
      email: user.email,
      action: 'login',
      userId: user.id
    });
  }

  _isLocalCredentialValid(account, password) {
    return account === '123' && password === '123';
  }

  _submitRegistration() {
    const account = this.registerForm.account.trim();
    const password = this.registerForm.password;
    const confirmPassword = this.registerForm.confirmPassword;
    const email = this.registerForm.email.trim();

    if (!account || !password || !confirmPassword || !email) {
      showToast('請填寫帳號、密碼、確認密碼與信箱');
      return;
    }

    if (password !== confirmPassword) {
      showToast('兩次密碼輸入不一致');
      return;
    }

    if (!this._isValidEmail(email)) {
      showToast('請輸入有效的信箱格式');
      return;
    }

    if (this.storage.findRegisteredUserByAccount(account)) {
      showToast('帳號已存在，請更換');
      return;
    }

    if (this.storage.findRegisteredUserByEmail(email)) {
      showToast('信箱已存在，請更換');
      return;
    }

    const savedUser = this.storage.saveRegisteredUser({
      id: generateId('user'),
      account,
      password,
      email,
      profile: {
        gender: this.registerForm.gender.trim(),
        age: this.registerForm.age.trim(),
        identity: this.registerForm.identity.trim()
      }
    });

    this.loginForm.account = savedUser.account;
    this.loginForm.password = '';
    this.registerForm = {
      account: '',
      password: '',
      confirmPassword: '',
      email: '',
      gender: '',
      age: '',
      identity: ''
    };
    this.screen = 'login';
    this.showPassword = false;
    showToast('註冊成功，請登入');
    this.render();
  }

  _isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  _enter(session) {
    this.onEnter({
      ...session,
      preview: true,
      enteredAt: getTimestamp()
    });
  }
}
