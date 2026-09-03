const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const PASSWORD_LENGTH_ERROR = 'Mật khẩu phải có độ dài từ 8 đến 128 ký tự';

function isPasswordLengthValid(password) {
    return typeof password === 'string' &&
        password.length >= MIN_PASSWORD_LENGTH &&
        password.length <= MAX_PASSWORD_LENGTH;
}

function passwordLengthError(password) {
    return isPasswordLengthValid(password) ? null : PASSWORD_LENGTH_ERROR;
}

module.exports = {
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH,
    PASSWORD_LENGTH_ERROR,
    isPasswordLengthValid,
    passwordLengthError
};
