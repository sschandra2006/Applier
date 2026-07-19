import logging
from pythonjsonlogger import jsonlogger
import os
import contextvars

correlation_id_ctx = contextvars.ContextVar('correlation_id', default=None)

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)
        log_record['severity'] = record.levelname
        
        c_id = correlation_id_ctx.get()
        if c_id:
            log_record['correlationId'] = c_id
            
        # Basic Redaction
        if 'password' in log_record:
            log_record['password'] = '[REDACTED]'
        if 'token' in log_record:
            log_record['token'] = '[REDACTED]'

def setup_logger(name: str):
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO if os.environ.get('ENV') == 'production' else logging.DEBUG)
    
    # Prevent duplicate handlers
    if not logger.handlers:
        logHandler = logging.StreamHandler()
        formatter = CustomJsonFormatter('%(asctime)s %(levelname)s %(name)s %(message)s', rename_fields={"asctime": "timestamp"})
        logHandler.setFormatter(formatter)
        logger.addHandler(logHandler)
    return logger
