class ServiceError(Exception):
    pass


class EntityNotFoundError(ServiceError):
    pass


class PermissionDeniedError(ServiceError):
    pass


class ValidationServiceError(ServiceError):
    pass


class AuthenticationServiceError(ServiceError):
    pass